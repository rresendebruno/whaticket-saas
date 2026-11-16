import React, { useEffect, useRef, useState } from "react";
import { makeStyles } from "@material-ui/core/styles";
import IconButton from "@material-ui/core/IconButton";
import Popover from "@material-ui/core/Popover";
import Typography from "@material-ui/core/Typography";
import Button from "@material-ui/core/Button";
import CircularProgress from "@material-ui/core/CircularProgress";
import SvgIcon from "@material-ui/core/SvgIcon";
import Tooltip from "@material-ui/core/Tooltip";
import ClearIcon from "@material-ui/icons/Clear";
import AddIcon from "@material-ui/icons/Add";
import { toast } from "react-toastify";

import api from "../../services/api";
import openSocket from "../../services/socket-io";
import toastError from "../../errors/toastError";
import { withToken } from "../../utils/mediaUrl";

const useStyles = makeStyles(theme => ({
  paper: {
    width: 360,
    maxWidth: "calc(100vw - 32px)",
    padding: 12,
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  title: {
    fontSize: 15,
    fontWeight: 600,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 6,
    maxHeight: 320,
    overflowY: "auto",
  },
  item: {
    position: "relative",
    aspectRatio: "1 / 1",
    borderRadius: 8,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    "&:hover": {
      background: theme.palette.action.hover,
    },
    "&:hover $removeBtn": {
      opacity: 1,
    },
  },
  img: {
    width: "100%",
    height: "100%",
    objectFit: "contain",
    padding: 4,
  },
  removeBtn: {
    position: "absolute",
    top: 0,
    right: 0,
    padding: 2,
    opacity: 0,
    background: "rgba(0,0,0,0.55)",
    color: "#fff",
    "&:hover": { background: "rgba(0,0,0,0.75)" },
  },
  removeIcon: { fontSize: 14 },
  empty: {
    padding: "24px 8px",
    textAlign: "center",
    color: theme.palette.text.secondary,
    fontSize: 13,
  },
  hiddenInput: { display: "none" },
}));

const StickerIcon = props => (
  <SvgIcon {...props}>
    <path d="M5.5,2C3.56,2 2,3.56 2,5.5V18.5C2,20.44 3.56,22 5.5,22H16L22,16V5.5C22,3.56 20.44,2 18.5,2H5.5M5.75,4H18.25A1.75,1.75 0 0,1 20,5.75V15H18.5C16.56,15 15,16.56 15,18.5V20H5.75A1.75,1.75 0 0,1 4,18.25V5.75A1.75,1.75 0 0,1 5.75,4M8.5,8A1.5,1.5 0 0,0 7,9.5A1.5,1.5 0 0,0 8.5,11A1.5,1.5 0 0,0 10,9.5A1.5,1.5 0 0,0 8.5,8M15.5,8A1.5,1.5 0 0,0 14,9.5A1.5,1.5 0 0,0 15.5,11A1.5,1.5 0 0,0 17,9.5A1.5,1.5 0 0,0 15.5,8M7,13C7.9,15.3 9.8,16.5 12,16.5C14.2,16.5 16.1,15.3 17,13H7Z" />
  </SvgIcon>
);

const StickerPicker = ({ ticketId, disabled, iconClassName }) => {
  const classes = useStyles();
  const [anchorEl, setAnchorEl] = useState(null);
  const [stickers, setStickers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sendingId, setSendingId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  const open = Boolean(anchorEl);

  // Load the gallery each time the picker opens
  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    api
      .get("/stickers")
      .then(({ data }) => active && setStickers(data))
      .catch(err => toastError(err))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [open]);

  // Keep the gallery in sync when someone else saves/removes a sticker
  useEffect(() => {
    if (!open) return;
    const socket = openSocket();
    socket.on("sticker", data => {
      if (data.action === "create") {
        setStickers(prev =>
          prev.some(s => s.id === data.sticker.id)
            ? prev
            : [data.sticker, ...prev]
        );
      }
      if (data.action === "delete") {
        setStickers(prev => prev.filter(s => s.id !== data.stickerId));
      }
    });
    return () => socket.disconnect();
  }, [open]);

  const handleSend = async sticker => {
    if (sendingId) return;
    setSendingId(sticker.id);
    try {
      await api.post(`/stickers/${sticker.id}/send/${ticketId}`);
      setAnchorEl(null);
    } catch (err) {
      toastError(err);
    }
    setSendingId(null);
  };

  const handleRemove = async (e, sticker) => {
    e.stopPropagation();
    if (!window.confirm("Remover esta figurinha das salvas?")) return;
    try {
      await api.delete(`/stickers/${sticker.id}`);
      setStickers(prev => prev.filter(s => s.id !== sticker.id));
    } catch (err) {
      toastError(err);
    }
  };

  const handleUpload = async e => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Escolha um arquivo de imagem (WEBP, PNG ou JPG)");
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("sticker", file);
      const { data } = await api.post("/stickers", formData);
      if (data?.alreadySaved) toast.info("Essa figurinha já está salva");
      setStickers(prev =>
        prev.some(s => s.id === data.id) ? prev : [data, ...prev]
      );
    } catch (err) {
      toastError(err);
    }
    setUploading(false);
  };

  return (
    <>
      <Tooltip title="Figurinhas">
        <span>
          <IconButton
            aria-label="stickerPicker"
            component="span"
            disabled={disabled}
            onClick={e => setAnchorEl(e.currentTarget)}
          >
            <StickerIcon className={iconClassName} />
          </IconButton>
        </span>
      </Tooltip>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: "top", horizontal: "left" }}
        transformOrigin={{ vertical: "bottom", horizontal: "left" }}
        classes={{ paper: classes.paper }}
      >
        <div className={classes.header}>
          <Typography className={classes.title}>Figurinhas salvas</Typography>
          <input
            type="file"
            accept="image/webp,image/png,image/jpeg,image/gif"
            ref={fileInputRef}
            className={classes.hiddenInput}
            onChange={handleUpload}
          />
          <Button
            size="small"
            color="primary"
            startIcon={
              uploading ? <CircularProgress size={14} /> : <AddIcon />
            }
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            Adicionar
          </Button>
        </div>

        {loading ? (
          <div className={classes.empty}>
            <CircularProgress size={24} />
          </div>
        ) : stickers.length === 0 ? (
          <div className={classes.empty}>
            Nenhuma figurinha salva ainda.
            <br />
            Abra o menu de uma figurinha recebida e escolha "Salvar
            figurinha", ou clique em Adicionar.
          </div>
        ) : (
          <div className={classes.grid}>
            {stickers.map(sticker => (
              <div
                key={sticker.id}
                className={classes.item}
                onClick={() => handleSend(sticker)}
                title="Enviar"
              >
                {sendingId === sticker.id ? (
                  <CircularProgress size={24} />
                ) : (
                  <img
                    src={withToken(sticker.url)}
                    alt="Figurinha"
                    className={classes.img}
                    loading="lazy"
                  />
                )}
                <IconButton
                  size="small"
                  className={classes.removeBtn}
                  onClick={e => handleRemove(e, sticker)}
                  aria-label="Remover figurinha"
                >
                  <ClearIcon className={classes.removeIcon} />
                </IconButton>
              </div>
            ))}
          </div>
        )}
      </Popover>
    </>
  );
};

export default StickerPicker;
