import { Request, Response } from "express";
import { Op, QueryTypes } from "sequelize";
import { startOfDay, endOfDay, parseISO } from "date-fns";

import Ticket from "../models/Ticket";
import User from "../models/User";
import Queue from "../models/Queue";
import sequelize from "../database";
import { getOnlineUserIds } from "../libs/socket";

const getRange = (dateStart?: string, dateEnd?: string) => ({
  start: dateStart ? startOfDay(parseISO(dateStart)) : startOfDay(new Date()),
  end: dateEnd ? endOfDay(parseISO(dateEnd)) : endOfDay(new Date())
});

const buildQueueWhere = (queueIds: number[]): any =>
  queueIds.length ? { queueId: { [Op.in]: queueIds } } : {};

export const overview = async (req: Request, res: Response): Promise<Response> => {
  const { dateStart, dateEnd, queueIds } = req.query as Record<string, string>;
  const { id: userId, profile } = req.user;
  const { start, end } = getRange(dateStart, dateEnd);

  let parsedQueueIds: number[] = queueIds ? JSON.parse(queueIds) : [];

  if (profile === "supervisor") {
    const self = await User.findByPk(userId, {
      include: [{ model: Queue, as: "queues", attributes: ["id"], through: { attributes: [] } }]
    });
    const supervisorIds: number[] = ((self as any)?.queues || []).map((q: any) => Number(q.id));
    parsedQueueIds = parsedQueueIds.length
      ? parsedQueueIds.filter(id => supervisorIds.includes(id))
      : supervisorIds;
  }

  const queueWhere = buildQueueWhere(parsedQueueIds);

  const [open, pending, closed, avgRows, byHour] = await Promise.all([
    Ticket.count({ where: { status: "open", ...queueWhere } as any }),
    Ticket.count({ where: { status: "pending", ...queueWhere } as any }),
    Ticket.count({
      where: {
        status: "closed",
        updatedAt: { [Op.between]: [start.getTime(), end.getTime()] },
        ...queueWhere
      } as any
    }),
    sequelize.query(
      `SELECT AVG(TIMESTAMPDIFF(SECOND, createdAt, updatedAt)) AS avgSeconds
       FROM Tickets
       WHERE status = 'closed'
         AND updatedAt BETWEEN :start AND :end
         ${parsedQueueIds.length ? `AND queueId IN (:queueIds)` : ""}`,
      {
        replacements: { start, end, queueIds: parsedQueueIds },
        type: QueryTypes.SELECT
      }
    ) as any,
    sequelize.query(
      `SELECT HOUR(createdAt) AS hour, COUNT(id) AS count
       FROM Tickets
       WHERE createdAt BETWEEN :start AND :end
         ${parsedQueueIds.length ? `AND queueId IN (:queueIds)` : ""}
       GROUP BY HOUR(createdAt)
       ORDER BY hour`,
      {
        replacements: { start, end, queueIds: parsedQueueIds },
        type: QueryTypes.SELECT
      }
    ) as any
  ]);

  const avgRow = (avgRows as any[])[0];
  return res.json({
    open,
    pending,
    closed,
    avgServiceTimeSeconds: Math.round(Number(avgRow?.avgSeconds) || 0),
    byHour
  });
};

export const supervisor = async (req: Request, res: Response): Promise<Response> => {
  const { id: userId, profile } = req.user;

  let allowedQueueIds: number[] = [];
  let isSupervisor = false;

  if (profile === "supervisor") {
    isSupervisor = true;
    const self = await User.findByPk(userId, {
      include: [{ model: Queue, as: "queues", attributes: ["id"], through: { attributes: [] } }]
    });
    allowedQueueIds = ((self as any)?.queues || []).map((q: any) => Number(q.id));
    if (allowedQueueIds.length === 0) {
      return res.json({ queues: [], noQueue: { pending: 0, open: 0 } });
    }
  }

  const queueWhere: any = { isGroupQueue: false };
  if (isSupervisor) queueWhere.id = { [Op.in]: allowedQueueIds };

  const ticketWhere: any = isSupervisor
    ? { queueId: { [Op.in]: allowedQueueIds } }
    : {};

  const [queues, users, pendingTickets, openTickets] = await Promise.all([
    Queue.findAll({ where: queueWhere, order: [["name", "ASC"]] }),
    User.findAll({
      attributes: ["id", "name", "lastLogin"],
      include: [{ model: Queue, as: "queues", attributes: ["id"], through: { attributes: [] } }]
    }),
    Ticket.findAll({ attributes: ["id", "queueId", "userId"], where: { status: "pending", ...ticketWhere } as any }),
    Ticket.findAll({ attributes: ["id", "queueId", "userId"], where: { status: "open", ...ticketWhere } as any })
  ]);

  const onlineIds = getOnlineUserIds();

  const queueData = queues.map(queue => {
    const qPending = pendingTickets.filter(t => t.queueId === queue.id).length;
    const qOpen = openTickets.filter(t => t.queueId === queue.id).length;
    const agents = users
      .filter(u => (u as any).queues?.some((q: any) => q.id === queue.id))
      .map(u => ({
        id: u.id,
        name: u.name,
        lastLogin: u.lastLogin || null,
        isOnline: onlineIds.includes(String(u.id)),
        openTickets: openTickets.filter(t => t.userId === u.id && t.queueId === queue.id).length
      }));

    return { id: queue.id, name: queue.name, color: queue.color, pending: qPending, open: qOpen, agents };
  });

  const noQueue = !isSupervisor
    ? {
        pending: pendingTickets.filter(t => !t.queueId).length,
        open: openTickets.filter(t => !t.queueId).length
      }
    : { pending: 0, open: 0 };

  return res.json({ queues: queueData, noQueue });
};
