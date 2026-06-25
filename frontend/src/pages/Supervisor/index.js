import React, { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";

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
import PersonIcon from "@material-ui/icons/Person";
import HourglassEmptyIcon from "@material-ui/icons/HourglassEmpty";
import ChatBubbleOutlineIcon from "@material-ui/icons/ChatBubbleOutline";

import api from "../../services/api";

const REFRESH_INTERVAL = 30000;

const useStyles = makeStyles(theme => ({
  container: { paddingTop: theme.spacing(3), paddingBottom: theme.spacing(4) },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: theme.spacing(3),
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
  counters: { display: "flex", gap: theme.spacing(1), marginBottom: theme.spacing(2) },
  agentDivider: { marginBottom: theme.spacing(1.5) },
  agentRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "4px 0",
  },
  agentLeft: { display: "flex", alignItems: "center", gap: theme.spacing(1) },
  agentAvatar: {
    width: 28,
    height: 28,
    fontSize: "0.75rem",
    backgroundColor: theme.palette.primary.light,
  },
  agentName: { fontSize: "0.85rem" },
  emptyAgents: {
    fontSize: "0.8rem",
    color: theme.palette.text.disabled,
    fontStyle: "italic",
  },
  noQueueCard: {
    borderTopColor: "#9e9e9e !important",
  },
}));

const initials = name =>
  name
    .split(" ")
    .slice(0, 2)
    .map(w => w[0])
    .join("")
    .toUpperCase();

const QueueCard = ({ queue, classes }) => {
  const color = queue.color || "#9e9e9e";
  return (
    <Paper
      className={`${classes.queueCard} ${!queue.color ? classes.noQueueCard : ""}`}
      style={{ borderTopColor: color }}
      elevation={2}
    >
      <div className={classes.queueHeader}>
        <Typography className={classes.queueName}>{queue.name}</Typography>
      </div>
      <div className={classes.counters}>
        <Tooltip title="Aguardando">
          <Chip
            size="small"
            icon={<HourglassEmptyIcon style={{ fontSize: 14 }} />}
            label={`${queue.pending} aguardando`}
            style={{
              background: "#f57c0022",
              color: "#f57c00",
              fontWeight: 600,
              border: "1px solid #f57c0044",
            }}
          />
        </Tooltip>
        <Tooltip title="Em atendimento">
          <Chip
            size="small"
            icon={<ChatBubbleOutlineIcon style={{ fontSize: 14 }} />}
            label={`${queue.open} em atendimento`}
            style={{
              background: "#1976d222",
              color: "#1976d2",
              fontWeight: 600,
              border: "1px solid #1976d244",
            }}
          />
        </Tooltip>
      </div>

      {queue.agents && queue.agents.length > 0 && (
        <>
          <Divider className={classes.agentDivider} />
          <Typography
            variant="caption"
            style={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}
          >
            Agentes
          </Typography>
          {queue.agents.map(agent => (
            <div key={agent.id} className={classes.agentRow}>
              <div className={classes.agentLeft}>
                <Avatar className={classes.agentAvatar}>{initials(agent.name)}</Avatar>
                <Typography className={classes.agentName}>{agent.name}</Typography>
              </div>
              <Chip
                size="small"
                label={agent.openTickets}
                title="Tickets abertos"
                style={{
                  minWidth: 28,
                  height: 20,
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  background: agent.openTickets > 0 ? "#1976d2" : "#e0e0e0",
                  color: agent.openTickets > 0 ? "#fff" : "#757575",
                }}
              />
            </div>
          ))}
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
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: result } = await api.get("/reports/supervisor");
      setData(result);
      setLastUpdated(new Date());
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

  const totalPending = data
    ? data.queues.reduce((s, q) => s + q.pending, 0) + data.noQueue.pending
    : 0;
  const totalOpen = data
    ? data.queues.reduce((s, q) => s + q.open, 0) + data.noQueue.open
    : 0;

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
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Chip
            icon={<HourglassEmptyIcon />}
            label={`${totalPending} aguardando`}
            color="default"
            style={{ fontWeight: 600 }}
          />
          <Chip
            icon={<ChatBubbleOutlineIcon />}
            label={`${totalOpen} em atendimento`}
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

      {!data && !loading && (
        <Typography color="textSecondary">Carregando dados...</Typography>
      )}

      <Grid container spacing={3}>
        {data?.queues.map(queue => (
          <Grid item xs={12} sm={6} md={4} key={queue.id}>
            <QueueCard queue={queue} classes={classes} />
          </Grid>
        ))}

        {data && (data.noQueue.pending > 0 || data.noQueue.open > 0) && (
          <Grid item xs={12} sm={6} md={4}>
            <QueueCard
              queue={{
                name: "Sem Fila",
                color: null,
                pending: data.noQueue.pending,
                open: data.noQueue.open,
                agents: []
              }}
              classes={classes}
            />
          </Grid>
        )}
      </Grid>
    </Container>
  );
};

export default Supervisor;
