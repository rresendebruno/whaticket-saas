import React, { useState, useEffect } from "react";

import {
  Avatar,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  TextField,
  makeStyles,
} from "@material-ui/core";
import SearchIcon from "@material-ui/icons/Search";
import { toast } from "react-toastify";

import api from "../../services/api";
import toastError from "../../errors/toastError";

const useStyles = makeStyles((theme) => ({
  dialog: {
    "& .MuiDialog-paper": {
      minWidth: 380,
      maxWidth: 480,
    },
  },
  searchField: {
    marginBottom: theme.spacing(1),
  },
  list: {
    maxHeight: 340,
    overflowY: "auto",
    ...theme.scrollbarStyles,
  },
  listItem: {
    borderRadius: 8,
    cursor: "pointer",
    "&:hover": {
      backgroundColor: theme.palette.action.hover,
    },
  },
  selectedItem: {
    backgroundColor: theme.palette.action.selected,
    "&:hover": {
      backgroundColor: theme.palette.action.selected,
    },
  },
  emptyText: {
    padding: theme.spacing(2),
    textAlign: "center",
    color: theme.palette.text.secondary,
  },
  progress: {
    display: "flex",
    justifyContent: "center",
    padding: theme.spacing(2),
  },
}));

// messageIds: array of message IDs to forward
const ForwardMessageModal = ({ open, onClose, messageIds = [] }) => {
  const classes = useStyles();
  const [search, setSearch] = useState("");
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedContact, setSelectedContact] = useState(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) {
      setSearch("");
      setContacts([]);
      setSelectedContact(null);
      return;
    }
    fetchContacts("");
  }, [open]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchContacts(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchContacts = async (searchTerm) => {
    setLoading(true);
    try {
      const { data } = await api.get("/contacts", {
        params: { searchParam: searchTerm, pageNumber: 1 },
      });
      setContacts(data.contacts || []);
    } catch (err) {
      toastError(err);
    } finally {
      setLoading(false);
    }
  };

  const handleForward = async () => {
    if (!selectedContact || messageIds.length === 0) return;
    setSending(true);
    try {
      for (const msgId of messageIds) {
        await api.post(`/messages/${msgId}/forward`, {
          contactId: selectedContact.id,
        });
      }
      toast.success(
        messageIds.length === 1
          ? "Mensagem encaminhada!"
          : `${messageIds.length} mensagens encaminhadas!`
      );
      onClose();
    } catch (err) {
      toastError(err);
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog className={classes.dialog} open={open} onClose={onClose}>
      <DialogTitle>
        {messageIds.length > 1
          ? `Encaminhar ${messageIds.length} mensagens`
          : "Encaminhar mensagem"}
      </DialogTitle>
      <DialogContent>
        <TextField
          className={classes.searchField}
          fullWidth
          size="small"
          variant="outlined"
          placeholder="Buscar contato..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon color="action" />
              </InputAdornment>
            ),
          }}
        />
        {loading ? (
          <div className={classes.progress}>
            <CircularProgress size={28} />
          </div>
        ) : contacts.length === 0 ? (
          <div className={classes.emptyText}>Nenhum contato encontrado</div>
        ) : (
          <List className={classes.list} disablePadding>
            {contacts.map((contact) => (
              <ListItem
                key={contact.id}
                className={
                  selectedContact?.id === contact.id
                    ? classes.selectedItem
                    : classes.listItem
                }
                onClick={() =>
                  setSelectedContact(
                    selectedContact?.id === contact.id ? null : contact
                  )
                }
              >
                <ListItemAvatar>
                  <Avatar src={contact.profilePicUrl} alt={contact.name} />
                </ListItemAvatar>
                <ListItemText
                  primary={contact.name}
                  secondary={contact.number}
                />
              </ListItem>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={sending}>
          Cancelar
        </Button>
        <Button
          onClick={handleForward}
          color="primary"
          variant="contained"
          disabled={!selectedContact || sending}
        >
          {sending ? <CircularProgress size={20} /> : "Encaminhar"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ForwardMessageModal;
