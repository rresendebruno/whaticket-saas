import React, { useState, useContext } from "react";

import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  makeStyles,
} from "@material-ui/core";

import { i18n } from "../../translate/i18n";
import { AuthContext } from "../../context/Auth/AuthContext";

const useStyles = makeStyles(() => ({
  formControl: {
    minWidth: 260,
  },
}));

const NewTicketWithQueueModal = ({ open, onClose, onConfirm, loading }) => {
  const classes = useStyles();
  const { user } = useContext(AuthContext);
  const [selectedQueueId, setSelectedQueueId] = useState("");

  const visibleQueues = (user.queues || []).filter(q => !q.isGroupQueue);

  const handleConfirm = () => {
    if (!selectedQueueId) return;
    onConfirm(Number(selectedQueueId));
  };

  const handleClose = () => {
    setSelectedQueueId("");
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
      <DialogTitle>
        {i18n.t("newTicketWithQueueModal.title")}
      </DialogTitle>
      <DialogContent dividers>
        <FormControl variant="outlined" className={classes.formControl} fullWidth>
          <InputLabel>{i18n.t("newTicketWithQueueModal.queueLabel")}</InputLabel>
          <Select
            value={selectedQueueId}
            onChange={e => setSelectedQueueId(e.target.value)}
            label={i18n.t("newTicketWithQueueModal.queueLabel")}
          >
            {visibleQueues.map(queue => (
              <MenuItem key={queue.id} value={queue.id}>
                {queue.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} color="default" disabled={loading}>
          {i18n.t("newTicketWithQueueModal.buttons.cancel")}
        </Button>
        <Button
          onClick={handleConfirm}
          color="primary"
          variant="contained"
          disabled={!selectedQueueId || loading}
        >
          {i18n.t("newTicketWithQueueModal.buttons.confirm")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default NewTicketWithQueueModal;
