import { Request, Response } from "express";
import { Op, QueryTypes } from "sequelize";
import { startOfDay, endOfDay, parseISO } from "date-fns";

import Ticket from "../models/Ticket";
import User from "../models/User";
import Queue from "../models/Queue";
import sequelize from "../database";

const getRange = (dateStart?: string, dateEnd?: string) => ({
  start: dateStart ? startOfDay(parseISO(dateStart)) : startOfDay(new Date()),
  end: dateEnd ? endOfDay(parseISO(dateEnd)) : endOfDay(new Date())
});

export const overview = async (req: Request, res: Response): Promise<Response> => {
  const { dateStart, dateEnd, queueIds } = req.query as Record<string, string>;
  const { start, end } = getRange(dateStart, dateEnd);

  const parsedQueueIds: number[] = queueIds ? JSON.parse(queueIds) : [];
  const queueWhere = parsedQueueIds.length
    ? { queueId: { [Op.in]: parsedQueueIds } }
    : {};

  const [open, pending, closed, avgRows, byHour] = await Promise.all([
    Ticket.count({ where: { status: "open", ...queueWhere } }),
    Ticket.count({ where: { status: "pending", ...queueWhere } }),
    Ticket.count({
      where: { status: "closed", updatedAt: { [Op.between]: [start, end] }, ...queueWhere }
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
  const [queues, users, pendingTickets, openTickets] = await Promise.all([
    Queue.findAll({ where: { isGroupQueue: false }, order: [["name", "ASC"]] }),
    User.findAll({
      attributes: ["id", "name"],
      include: [{ model: Queue, as: "queues", attributes: ["id"], through: { attributes: [] } }]
    }),
    Ticket.findAll({ attributes: ["id", "queueId", "userId"], where: { status: "pending" } }),
    Ticket.findAll({ attributes: ["id", "queueId", "userId"], where: { status: "open" } })
  ]);

  const queueData = queues.map(queue => {
    const qPending = pendingTickets.filter(t => t.queueId === queue.id).length;
    const qOpen = openTickets.filter(t => t.queueId === queue.id).length;
    const agents = users
      .filter(u => (u as any).queues?.some((q: any) => q.id === queue.id))
      .map(u => ({
        id: u.id,
        name: u.name,
        openTickets: openTickets.filter(t => t.userId === u.id && t.queueId === queue.id).length
      }));

    return { id: queue.id, name: queue.name, color: queue.color, pending: qPending, open: qOpen, agents };
  });

  return res.json({
    queues: queueData,
    noQueue: {
      pending: pendingTickets.filter(t => !t.queueId).length,
      open: openTickets.filter(t => !t.queueId).length
    }
  });
};
