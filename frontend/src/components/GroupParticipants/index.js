import React, { useEffect, useMemo, useState } from "react";
import { makeStyles } from "@material-ui/core/styles";
import Paper from "@material-ui/core/Paper";
import Typography from "@material-ui/core/Typography";
import List from "@material-ui/core/List";
import ListItem from "@material-ui/core/ListItem";
import ListItemAvatar from "@material-ui/core/ListItemAvatar";
import ListItemText from "@material-ui/core/ListItemText";
import Avatar from "@material-ui/core/Avatar";
import Chip from "@material-ui/core/Chip";
import TextField from "@material-ui/core/TextField";
import IconButton from "@material-ui/core/IconButton";
import Tooltip from "@material-ui/core/Tooltip";
import CircularProgress from "@material-ui/core/CircularProgress";
import RefreshIcon from "@material-ui/icons/Refresh";

import api from "../../services/api";

const useStyles = makeStyles(theme => ({
  paper: {
    marginTop: 8,
    padding: 8,
    display: "flex",
    flexDirection: "column",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  description: {
    whiteSpace: "pre-wrap",
    fontSize: 13,
    color: theme.palette.text.secondary,
    margin: "4px 0 8px",
  },
  item: { paddingLeft: 4, paddingRight: 4 },
  adminChip: { height: 18, fontSize: 10, marginLeft: 6 },
  note: { fontSize: 12, color: theme.palette.text.secondary, padding: "4px 0" },
}));

// Read-only list of a WhatsApp group's participants (shown in ContactDrawer)
const GroupParticipants = ({ ticketId }) => {
  const classes = useStyles();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    setError(false);
    try {
      const { data: res } = await api.get(`/messages/${ticketId}/group-members`);
      setData(res);
    } catch (err) {
      setError(true);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (ticketId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId]);

  const members = useMemo(() => {
    const list = data?.members || [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      m =>
        String(m.name || "").toLowerCase().includes(q) ||
        String(m.phone || "").includes(q.replace(/\D/g, "") || "~")
    );
  }, [data, search]);

  const total = data?.members?.length || 0;

  return (
    <Paper square variant="outlined" className={classes.paper}>
      <div className={classes.header}>
        <Typography variant="subtitle1">
          Participantes{total ? ` (${total})` : ""}
        </Typography>
        <Tooltip title="Atualizar">
          <span>
            <IconButton size="small" onClick={load} disabled={loading}>
              {loading ? <CircularProgress size={16} /> : <RefreshIcon fontSize="small" />}
            </IconButton>
          </span>
        </Tooltip>
      </div>

      {data?.description && (
        <Typography className={classes.description}>{data.description}</Typography>
      )}

      {data?.source === "history" && (
        <Typography className={classes.note}>
          Não foi possível consultar o WhatsApp agora. Mostrando apenas quem já
          enviou mensagem neste atendimento.
        </Typography>
      )}
      {error && (
        <Typography className={classes.note}>
          Não foi possível carregar os participantes.
        </Typography>
      )}

      {total > 8 && (
        <TextField
          size="small"
          margin="dense"
          variant="outlined"
          placeholder="Buscar participante"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      )}

      <List dense disablePadding>
        {members.map(m => (
          <ListItem key={m.phone} className={classes.item}>
            <ListItemAvatar>
              <Avatar src={m.profilePicUrl || undefined}>
                {String(m.name || "?").charAt(0).toUpperCase()}
              </Avatar>
            </ListItemAvatar>
            <ListItemText
              primary={
                <span style={{ display: "flex", alignItems: "center" }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {m.name}
                  </span>
                  {m.isAdmin && (
                    <Chip
                      label={m.isSuperAdmin ? "Criador" : "Admin"}
                      size="small"
                      color="primary"
                      variant="outlined"
                      className={classes.adminChip}
                    />
                  )}
                </span>
              }
              secondary={m.name !== m.phone ? m.phone : null}
            />
          </ListItem>
        ))}
        {!loading && data && members.length === 0 && (
          <Typography className={classes.note}>Nenhum participante encontrado.</Typography>
        )}
      </List>
    </Paper>
  );
};

export default GroupParticipants;
