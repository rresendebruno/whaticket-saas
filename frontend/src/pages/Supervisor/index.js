import React, { useState, useEffect, useCallback, useContext } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

import Container from "@material-ui/core/Container";
import Grid from "@material-ui/core/Grid";
import Paper from "@material-ui/core/Paper";
import Typography from "@material-ui/core/Typography";
import Chip from "@material-ui/core/Chip";
import Avatar from "@material-ui/core/Avatar";
import IconButton from "@material-ui/core/IconButton";
import Tooltip from "@material-ui/core/Tooltip";
import Divider from "@material-ui/core/Divider";
import CircularProgress from "@material-ui/core/CircularProgress";
import { makeStyles } from "@material-ui/core/styles";

import RefreshIcon from "@material-ui/icons/Refresh";
import HourglassEmptyIcon from "@material-ui/icons/HourglassEmpty";
import ChatBubbleOutlineIcon from "@material-ui/icons/ChatBubbleOutline";

import api from "../../services/api";
import openSocket from "../../services/socket-io";
import { AuthContext } from "../../context/Auth/AuthContext";

const REFRESH_INTERVAL = 30000;

const useStyles = makeStyles(theme => ({
  container: { paddingTop: theme.spacing(3), paddingBottom: theme.spacing(4) },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: theme.spacing(3),
    flexWrap: "wrap",
    gap: theme.spacing(1),
  },
  lastUpdated: {
    fontSize: "0.8rem",
    color: theme.palette.text.secondary,
    marginLeft: theme.spacing(1),
  },
  queueCard: {
    padding: theme.spacing(2),
    borderRadius: 10,
    borderTop: "4px solid",
    height: "100%",
  },
  queueHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: theme.spacing(1.5),
  },
  queueName: { fontWeight: 700, fontSize: "1rem" },
  counters: { display: "flex", gap: theme.spacing(1), marginBottom: theme.spacing(2), flexWrap: "wrap" },
  agentDivider: { marginBottom: theme.spacing(1) },
  agentRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "5px 0",
  },
  agentLeft: { display: "flex", alignItems: "center", gap: theme.spacing(1), flex: 1, minWidth: 0 },
  agentInfo: { display: "flex", flexDirection: "column", minWidth: 0 },
  avatarWrap: { position: "relative", display: "inline-flex", flexShrink: 0 },
  agentAvatar: {
    width: 30,
    height: 30,
    fontSize: "0.75rem",
    backgroundColor: theme.palette.primary.light,
  },
  onlineDot: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 9,
    height: 9,
    borderRadius: "50%",
    border: "1.5px solid #fff",
  },
  agentName: { fontSize: "0.85rem", lineHeight: 1.2 },
  agentLastLogin: {
    fontSize: "0.7rem",
    color: theme.palette.text.disabled,
    lineHeight: 1.2,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  onlineCount: {
    fontSize: "0.75rem",
    color: theme.palette.text.secondary,
    marginBottom: theme.spacing(1),
  },
  emptyAgents: {
    fontSize: "0.8rem",
    color: theme.palette.text.disabled,
    fontStyle: "italic",
    marginTop: 4,
  },
}));

const initials = name =>
  name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();

const fmtLastLogin = lastLogin => {
  if (!lastLogin) return "Nunca fez login";
  try {
    const d = new Date(lastLogin);
    const dist = formatDistanceToNow(d, { locale: ptBR, addSuffix: false });
    return `Há ${dist} · ${format(d, "dd/MM HH:mm")}`;
  } catch {
    return "";
  }
};

const QueueCard = ({ queue, onlineIds, classes }) => {
  const color = queue.color || "#9e9e9e";
  const onlineAgents = (queue.agents || []).filter(a => onlineIds.has(String(a.id))).length;

  return (
    <Paper className={classes.queueCard} style={{ borderTopColor: color }} elevation={2}>
      <div className={classes.queueHeader}>
        <Typography className={classes.queueName}>{queue.name}</Typography>
      </div>

      <div className={classes.counters}>
        <Tooltip title="Aguardando atendimento">
          <Chip
            size="small"
            icon={<HourglassEmptyIcon style={{ fontSize: 14 }} />}
            label={`${queue.pending} aguardando`}
            style={{ background: "#f57c0022", color: "#f57c00", fontWeight: 600, border: "1px solid #f57c0044" }}
          />
        </Tooltip>
        <Tooltip title="Em atendimento agora">
          <Chip
            size="small"
            icon={<ChatBubbleOutlineIcon style={{ fontSize: 14 }} />}
            label={`${queue.open} atendendo`}
            style={{ background: "#1976d222", color: "#1976d2", fontWeight: 600, border: "1px solid #1976d244" }}
          />
        </Tooltip>
      </div>

      {queue.agents && queue.agents.length > 0 && (
        <>
          <Divider className={classes.agentDivider} />
          <Typography variant="caption" className={classes.onlineCount}>
            Agentes — <span style={{ color: "#43a047", fontWeight: 600 }}>{onlineAgents} online</span>
            {" / "}{queue.agents.length} total
          </Typography>

          {queue.agents
            .slice()
            .sort((a, b) => {
              // Online primeiro, depois por nome
              if (onlineIds.has(String(a.id)) !== onlineIds.has(String(b.id)))
                return onlineIds.has(String(a.id)) ? -1 : 1;
              return a.name.localeCompare(b.name);
            })
            .map(agent => {
              const isOnline = onlineIds.has(String(agent.id));
              return (
                <div key={agent.id} className={classes.agentRow}>
                  <div className={classes.agentLeft}>
                    <div className={classes.avatarWrap}>
                      <Avatar
                        className={classes.agentAvatar}
                        style={{ opacity: isOnline ? 1 : 0.45 }}
                      >
                        {initials(agent.name)}
                      </Avatar>
                      <span
                        className={classes.onlineDot}
                        style={{ background: isOnline ? "#43a047" : "#bdbdbd" }}
                      />
                    </div>
                    <div className={classes.agentInfo}>
                      <Typography
                        className={classes.agentName}
                        style={{ color: isOnline ? "inherit" : "#9e9e9e" }}
                      >
                        {agent.name}
                      </Typography>
                      {!isOnline && (
                        <span className={classes.agentLastLogin}>
                          {fmtLastLogin(agent.lastLogin)}
                        </span>
                      )}
                    </div>
                  </div>
                  <Tooltip title="Tickets em atendimento">
                    <Chip
                      size="small"
                      label={agent.openTickets}
                      style={{
                        minWidth: 28,
                        height: 20,
                        fontSize: "0.72rem",
                        fontWeight: 700,
                        background: agent.openTickets > 0 ? "#1976d2" : "#e0e0e0",
                        color: agent.openTickets > 0 ? "#fff" : "#757575",
                      }}
                    />
                  </Tooltip>
                </div>
              );
            })}
        </>
      )}
      {queue.agents && queue.agents.length === 0 && (
        <>
          <Divider className={classes.agentDivider} />
          <Typography className={classes.emptyAgents}>Nenhum agente nesta fila</Typography>
        </>
      )}
    </Paper>
  );
};

const Supervisor = () => {
  const classes = useStyles();
  const { user } = useContext(AuthContext);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [onlineIds, setOnlineIds] = useState(new Set());

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: result } = await api.get("/reports/supervisor");
      setData(result);
      setLastUpdated(new Date());
      const initial = new Set();
      result.queues.forEach(q =>
        q.agents.forEach(a => { if (a.isOnline) initial.add(String(a.id)); })
      );
      setOnlineIds(initial);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const timer = setInterval(fetchData, REFRESH_INTERVAL);
    return () => clearInterval(timer);
  }, [fetchData]);

  useEffect(() => {
    const socket = openSocket();
    socket.on("userOnline", ({ userId }) =>
      setOnlineIds(prev => new Set([...prev, String(userId)]))
    );
    socket.on("userOffline", ({ userId }) =>
      setOnlineIds(prev => { const n = new Set(prev); n.delete(String(userId)); return n; })
    );
    return () => { socket.disconnect(); };
  }, [user]);

  const totalPending = data
    ? data.queues.reduce((s, q) => s + q.pending, 0) + data.noQueue.pending : 0;
  const totalOpen = data
    ? data.queues.reduce((s, q) => s + q.open, 0) + data.noQueue.open : 0;

  return (
    <Container maxWidth="lg" className={classes.container}>
      <div className={classes.header}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <Typography variant="h5" style={{ fontWeight: 700 }}>
            Supervisor de Filas
          </Typography>
          {loading && <CircularProgress size={18} style={{ marginLeft: 12 }} />}
          {lastUpdated && (
            <span className={classes.lastUpdated}>
              Atualizado às {format(lastUpdated, "HH:mm:ss")}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Chip
            size="small"
            label={`${onlineIds.size} online`}
            style={{ background: "#43a04722", color: "#43a047", fontWeight: 700, border: "1px solid #43a04744" }}
          />
          <Chip
            icon={<HourglassEmptyIcon />}
            label={`${totalPending} aguardando`}
            color="default"
            style={{ fontWeight: 600 }}
          />
          <Chip
            icon={<ChatBubbleOutlineIcon />}
            label={`${totalOpen} atendendo`}
            color="primary"
            style={{ fontWeight: 600 }}
          />
          <Tooltip title="Atualizar agora">
            <IconButton size="small" onClick={fetchData} disabled={loading}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        </div>
      </div>

      <Grid container spacing={3}>
        {data?.queues.map(queue => (
          <Grid item xs={12} sm={6} md={4} key={queue.id}>
            <QueueCard queue={queue} onlineIds={onlineIds} classes={classes} />
          </Grid>
        ))}
        {data && (data.noQueue.pending > 0 || data.noQueue.open > 0) && (
          <Grid item xs={12} sm={6} md={4}>
            <QueueCard
              queue={{ name: "Sem Fila", color: null, pending: data.noQueue.pending, open: data.noQueue.open, agents: [] }}
              onlineIds={onlineIds}
              classes={classes}
            />
          </Grid>
        )}
      </Grid>
    </Container>
  );
};

export default Supervisor;
