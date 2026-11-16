import React, { useState, useContext } from "react";

import MenuItem from "@material-ui/core/MenuItem";

import { i18n } from "../../translate/i18n";
import api from "../../services/api";
import ConfirmationModal from "../ConfirmationModal";
import { Menu, IconButton, Tooltip } from "@material-ui/core";

// Same quick set WhatsApp shows
const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
import { ReplyMessageContext } from "../../context/ReplyingMessage/ReplyingMessageContext";
import toastError from "../../errors/toastError";
import { toast } from "react-toastify";

const MessageOptionsMenu = ({
  message,
  menuOpen,
  handleClose,
  anchorEl,
  onStartForward,
}) => {
  const { setReplyingMessage } = useContext(ReplyMessageContext);
  const [confirmationOpen, setConfirmationOpen] = useState(false);

  const handleDeleteMessage = async () => {
    try {
      await api.delete(`/messages/${message.id}`);
    } catch (err) {
      toastError(err);
    }
  };

  const hanldeReplyMessage = () => {
    setReplyingMessage(message);
    handleClose();
  };

  const handleOpenConfirmationModal = (e) => {
    setConfirmationOpen(true);
    handleClose();
  };

  const handleSaveSticker = async () => {
    handleClose();
    try {
      const { data } = await api.post(`/stickers/from-message/${message.id}`);
      if (data?.alreadySaved) {
        toast.info("Essa figurinha já está salva");
      } else {
        toast.success("Figurinha salva");
      }
    } catch (err) {
      toastError(err);
    }
  };

  const myReaction = (message.reactions || []).find(
    (r) => r.senderNumber === "me"
  )?.emoji;

  const handleReact = async (emoji) => {
    handleClose();
    try {
      if (emoji === myReaction) {
        // Clicking the same emoji again removes it (like WhatsApp)
        await api.delete(`/messages/${message.id}/reactions`);
      } else {
        await api.post(`/messages/${message.id}/reactions`, { emoji });
      }
    } catch (err) {
      toastError(err);
    }
  };

  const handleRemoveReaction = async () => {
    handleClose();
    try {
      await api.delete(`/messages/${message.id}/reactions`);
    } catch (err) {
      toastError(err);
    }
  };

  const handleForwardClick = () => {
    handleClose();
    if (onStartForward) onStartForward(message);
  };

  return (
    <>
      <ConfirmationModal
        title={i18n.t("messageOptionsMenu.confirmationModal.title")}
        open={confirmationOpen}
        onClose={setConfirmationOpen}
        onConfirm={handleDeleteMessage}
      >
        {i18n.t("messageOptionsMenu.confirmationModal.message")}
      </ConfirmationModal>
      <Menu
        anchorEl={anchorEl}
        getContentAnchorEl={null}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "right",
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "right",
        }}
        open={menuOpen}
        onClose={handleClose}
      >
        {!message.isDeleted && message.mediaType !== "note" && (
          <div
            style={{
              display: "flex",
              gap: 2,
              padding: "2px 8px 6px",
              borderBottom: "1px solid rgba(0,0,0,0.08)",
              marginBottom: 4,
            }}
          >
            {QUICK_REACTIONS.map((emoji) => (
              <Tooltip key={emoji} title={emoji === myReaction ? "Remover reação" : "Reagir"}>
                <IconButton
                  size="small"
                  onClick={() => handleReact(emoji)}
                  style={{
                    fontSize: 20,
                    width: 34,
                    height: 34,
                    background:
                      emoji === myReaction ? "rgba(25,118,210,0.15)" : undefined,
                  }}
                >
                  {emoji}
                </IconButton>
              </Tooltip>
            ))}
          </div>
        )}
        {myReaction && (
          <MenuItem onClick={handleRemoveReaction}>
            Remover minha reação ({myReaction})
          </MenuItem>
        )}
        {message.fromMe && (
          <MenuItem onClick={handleOpenConfirmationModal}>
            {i18n.t("messageOptionsMenu.delete")}
          </MenuItem>
        )}
        <MenuItem onClick={hanldeReplyMessage}>
          {i18n.t("messageOptionsMenu.reply")}
        </MenuItem>
        <MenuItem onClick={handleForwardClick}>
          Encaminhar
        </MenuItem>
        {message.mediaType === "sticker" && message.mediaUrl && (
          <MenuItem onClick={handleSaveSticker}>
            Salvar figurinha
          </MenuItem>
        )}
      </Menu>
    </>
  );
};

export default MessageOptionsMenu;
