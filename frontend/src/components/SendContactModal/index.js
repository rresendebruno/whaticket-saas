import React, { useEffect, useState } from "react";
import Dialog from "@material-ui/core/Dialog";
import DialogTitle from "@material-ui/core/DialogTitle";
import DialogContent from "@material-ui/core/DialogContent";
import DialogActions from "@material-ui/core/DialogActions";
import Button from "@material-ui/core/Button";
import TextField from "@material-ui/core/TextField";
import List from "@material-ui/core/List";
import ListItem from "@material-ui/core/ListItem";
import ListItemAvatar from "@material-ui/core/ListItemAvatar";
import ListItemText from "@material-ui/core/ListItemText";
import Avatar from "@material-ui/core/Avatar";
import Typography from "@material-ui/core/Typography";
import CircularProgress from "@material-ui/core/CircularProgress";
import InputAdornment from "@material-ui/core/InputAdornment";
import SearchIcon from "@material-ui/icons/Search";
import { toast } from "react-toastify";

import api from "../../services/api";
import toastError from "../../errors/toastError";

// Lets the agent pick a saved contact (or type one) and share it as a
// WhatsApp contact card in the current ticket.
const SendContactModal = ({ open, onClose, ticketId, quotedMsgId, onSent }) => {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) {
      setSearch("");
      setResults([]);
      setName("");
      setPhone("");
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get("/contacts/", {
          params: { searchParam: search, pageNumber: 1 },
        });
        // Groups can't be shared as a contact card
        setResults((data.contacts || []).filter((c) => !c.isGroup));
      } catch (err) {
        toastError(err);
      }
      setSearching(false);
    }, 400);
    return () => clearTimeout(t);
  }, [search, open]);

  const handlePick = (contact) => {
    setName(contact.name || "");
    setPhone(String(contact.number || "").replace(/\D/g, ""));
  };

  const digits = phone.replace(/\D/g, "");
  const canSend = name.trim().length > 0 && digits.length >= 8 && !sending;

  const handleSend = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      await api.post(`/messages/${ticketId}/contact`, {
        contactName: name.trim(),
        contactPhone: digits,
        ...(quotedMsgId && { quotedMsgId }),
      });
      toast.success("Contato enviado");
      if (onSent) onSent();
      onClose();
    } catch (err) {
      toastError(err);
    }
    setSending(false);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth scroll="paper">
      <DialogTitle>Enviar contato</DialogTitle>
      <DialogContent dividers>
        <TextField
          fullWidth
          autoFocus
          margin="dense"
          variant="outlined"
          placeholder="Buscar nos contatos"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                {searching ? <CircularProgress size={18} /> : <SearchIcon color="action" />}
              </InputAdornment>
            ),
          }}
        />
        <List dense style={{ maxHeight: 220, overflowY: "auto" }}>
          {results.map((c) => (
            <ListItem
              key={c.id}
              button
              selected={digits === String(c.number).replace(/\D/g, "")}
              onClick={() => handlePick(c)}
            >
              <ListItemAvatar>
                <Avatar src={c.profilePicUrl} />
              </ListItemAvatar>
              <ListItemText primary={c.name} secondary={c.number} />
            </ListItem>
          ))}
          {!searching && results.length === 0 && (
            <Typography variant="body2" color="textSecondary" style={{ padding: 8 }}>
              Nenhum contato encontrado. Preencha nome e número abaixo.
            </Typography>
          )}
        </List>

        <Typography variant="caption" color="textSecondary">
          Contato a enviar
        </Typography>
        <TextField
          fullWidth
          margin="dense"
          variant="outlined"
          label="Nome"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <TextField
          fullWidth
          margin="dense"
          variant="outlined"
          label="Número com DDI e DDD"
          placeholder="5511999999999"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          helperText="Somente números. Ex.: 55 + DDD + número"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="secondary" variant="outlined" disabled={sending}>
          Cancelar
        </Button>
        <Button
          onClick={handleSend}
          color="primary"
          variant="contained"
          disabled={!canSend}
          startIcon={sending ? <CircularProgress size={16} color="inherit" /> : null}
        >
          Enviar
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default SendContactModal;
