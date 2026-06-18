import React, { useState, useEffect, useContext, useRef } from "react";
import "emoji-mart/css/emoji-mart.css";
import { useParams } from "react-router-dom";
import { Picker } from "emoji-mart";
import clsx from "clsx";

import { makeStyles } from "@material-ui/core/styles";
import Paper from "@material-ui/core/Paper";
import InputBase from "@material-ui/core/InputBase";
import CircularProgress from "@material-ui/core/CircularProgress";
import { green } from "@material-ui/core/colors";
import AttachFileIcon from "@material-ui/icons/AttachFile";
import IconButton from "@material-ui/core/IconButton";
import MoreVert from "@material-ui/icons/MoreVert";
import MoodIcon from "@material-ui/icons/Mood";
import SendIcon from "@material-ui/icons/Send";
import CancelIcon from "@material-ui/icons/Cancel";
import ClearIcon from "@material-ui/icons/Clear";
import MicIcon from "@material-ui/icons/Mic";
import CheckCircleOutlineIcon from "@material-ui/icons/CheckCircleOutline";
import HighlightOffIcon from "@material-ui/icons/HighlightOff";
import InsertDriveFileIcon from "@material-ui/icons/InsertDriveFile";
import AddIcon from "@material-ui/icons/Add";
import CloudUploadIcon from "@material-ui/icons/CloudUpload";
import {
  Hidden,
  Menu,
  MenuItem,
  Typography,
} from "@material-ui/core";
import ClickAwayListener from "@material-ui/core/ClickAwayListener";

import { i18n } from "../../translate/i18n";
import api from "../../services/api";
import RecordingTimer from "./RecordingTimer";
import { ReplyMessageContext } from "../../context/ReplyingMessage/ReplyingMessageContext";
import { AuthContext } from "../../context/Auth/AuthContext";
import toastError from "../../errors/toastError";

let Mp3Recorder = null;

const initRecorder = async () => {
  if (!Mp3Recorder) {
    try {
      const MicRecorder = (await import("mic-recorder-to-mp3")).default;
      Mp3Recorder = new MicRecorder({ bitRate: 128 });
    } catch (error) {
      console.error("Failed to initialize recorder:", error);
      return null;
    }
  }
  return Mp3Recorder;
};

const useStyles = makeStyles(theme => ({
  mainWrapper: {
    background: theme.palette.background.default,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    borderTop: "1px solid rgba(0, 0, 0, 0.12)",
    [theme.breakpoints.down("sm")]: {
      position: "fixed",
      bottom: 0,
      width: "100%",
    },
  },

  newMessageBox: {
    background: theme.palette.background.default,
    width: "100%",
    display: "flex",
    padding: "7px",
    alignItems: "center",
  },

  messageInputWrapper: {
    padding: 6,
    marginRight: 7,
    background: theme.palette.background.paper,
    display: "flex",
    borderRadius: 20,
    flex: 1,
    position: "relative",
  },

  messageInput: {
    paddingLeft: 10,
    flex: 1,
    border: "none",
  },

  sendMessageIcons: {
    color: "grey",
  },

  uploadInput: {
    display: "none",
  },

  // --- Media preview area ---
  viewMediaInputWrapper: {
    display: "flex",
    flexDirection: "column",
    padding: "10px 13px 6px",
    backgroundColor: theme.palette.background.default,
    borderTop: "1px solid rgba(0, 0, 0, 0.12)",
    width: "100%",
    boxSizing: "border-box",
  },

  mediaPreviewHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },

  mediaPreviewTitle: {
    fontSize: 13,
    color: theme.palette.type === "dark" ? "#ccc" : "#555",
  },

  mediaPreviewActions: {
    display: "flex",
    alignItems: "center",
    gap: 4,
  },

  mediaPreviewGrid: {
    display: "flex",
    flexDirection: "row",
    gap: 8,
    overflowX: "auto",
    paddingBottom: 6,
    "&::-webkit-scrollbar": {
      height: 4,
    },
    "&::-webkit-scrollbar-thumb": {
      background: "rgba(0,0,0,0.2)",
      borderRadius: 2,
    },
  },

  mediaPreviewCard: {
    position: "relative",
    minWidth: 100,
    width: 100,
    height: 90,
    borderRadius: 8,
    overflow: "hidden",
    background: theme.palette.type === "dark" ? "#2a2a2a" : "#f0f0f0",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    border: `1px solid ${theme.palette.type === "dark" ? "#444" : "#ddd"}`,
    flexShrink: 0,
  },

  mediaPreviewThumb: {
    width: "100%",
    height: 70,
    objectFit: "cover",
    display: "block",
  },

  mediaPreviewFileIcon: {
    fontSize: 36,
    color: theme.palette.type === "dark" ? "#7ab4f5" : "#1976d2",
    marginBottom: 4,
  },

  mediaPreviewName: {
    fontSize: 10,
    textAlign: "center",
    padding: "2px 6px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    width: "100%",
    boxSizing: "border-box",
    color: theme.palette.type === "dark" ? "#ccc" : "#444",
    lineHeight: "14px",
  },

  mediaPreviewRemoveBtn: {
    position: "absolute",
    top: 3,
    right: 3,
    padding: 1,
    background: "rgba(0,0,0,0.55)",
    borderRadius: "50%",
    color: "#fff",
    cursor: "pointer",
    lineHeight: 0,
    border: "none",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    "&:hover": {
      background: "rgba(200,0,0,0.75)",
    },
    "& svg": {
      fontSize: 13,
    },
  },

  mediaPreviewAddCard: {
    minWidth: 100,
    width: 100,
    height: 90,
    borderRadius: 8,
    border: `2px dashed ${theme.palette.type === "dark" ? "#555" : "#bbb"}`,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    color: theme.palette.type === "dark" ? "#888" : "#aaa",
    flexShrink: 0,
    background: "transparent",
    transition: "border-color 0.15s, color 0.15s",
    "&:hover": {
      borderColor: theme.palette.primary.main,
      color: theme.palette.primary.main,
    },
  },

  // --- Drag overlay ---
  dragOverlay: {
    position: "fixed",
    inset: 0,
    zIndex: 9999,
    background: "rgba(25, 118, 210, 0.12)",
    backdropFilter: "blur(2px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "none",
  },

  dragOverlayBox: {
    border: "3px dashed #1976d2",
    borderRadius: 20,
    padding: "36px 72px",
    background: theme.palette.type === "dark"
      ? "rgba(30,30,30,0.92)"
      : "rgba(255,255,255,0.92)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 12,
    boxShadow: "0 4px 32px rgba(0,0,0,0.18)",
  },

  dragOverlayIcon: {
    fontSize: 52,
    color: "#1976d2",
  },

  dragOverlayText: {
    fontSize: 18,
    fontWeight: 600,
    color: "#1976d2",
  },

  // --- Existing styles ---
  emojiBox: {
    position: "absolute",
    bottom: 63,
    width: 40,
    borderTop: "1px solid #e8e8e8",
  },

  circleLoading: {
    color: green[500],
    opacity: "70%",
    position: "absolute",
    top: "20%",
    left: "50%",
    marginLeft: -12,
  },

  audioLoading: {
    color: green[500],
    opacity: "70%",
  },

  recorderWrapper: {
    display: "flex",
    alignItems: "center",
    alignContent: "middle",
  },

  cancelAudioIcon: {
    color: "red",
  },

  sendAudioIcon: {
    color: "green",
  },

  replyginMsgWrapper: {
    display: "flex",
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 8,
    paddingLeft: 73,
    paddingRight: 7,
  },

  replyginMsgContainer: {
    flex: 1,
    marginRight: 5,
    overflowY: "hidden",
    backgroundColor: "rgba(0, 0, 0, 0.05)",
    borderRadius: "7.5px",
    display: "flex",
    position: "relative",
  },

  replyginMsgBody: {
    padding: 10,
    height: "auto",
    display: "block",
    whiteSpace: "pre-wrap",
    overflow: "hidden",
  },

  replyginContactMsgSideColor: {
    flex: "none",
    width: "4px",
    backgroundColor: "#35cd96",
  },

  replyginSelfMsgSideColor: {
    flex: "none",
    width: "4px",
    backgroundColor: "#6bcbef",
  },

  messageContactName: {
    display: "flex",
    color: "#6bcbef",
    fontWeight: 500,
  },

  messageQuickAnswersWrapper: {
    margin: 0,
    position: "absolute",
    bottom: "50px",
    background: theme.palette.background.paper,
    padding: "2px",
    border: "1px solid #CCC",
    left: 0,
    width: "100%",
    "& li": {
      listStyle: "none",
      "& a": {
        display: "block",
        padding: "8px",
        textOverflow: "ellipsis",
        overflow: "hidden",
        maxHeight: "32px",
        "&:hover": {
          background: theme.palette.type === "dark" ? "#333" : "#F1F1F1",
          cursor: "pointer",
        },
      },
    },
  },
}));

const MessageInput = ({ ticketStatus }) => {
  const classes = useStyles();
  const { ticketId } = useParams();

  const [medias, setMedias] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [inputMessage, setInputMessage] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [quickAnswers, setQuickAnswer] = useState([]);
  const [typeBar, setTypeBar] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);
  const addMoreInputRef = useRef(null);
  const inputRef = useRef();
  const [anchorEl, setAnchorEl] = useState(null);
  const { setReplyingMessage, replyingMessage } = useContext(ReplyMessageContext);
  const { user } = useContext(AuthContext);

  const signMessage = true;

  // Generate/revoke object URL previews whenever medias changes
  useEffect(() => {
    const urls = medias.map(file =>
      file.type.startsWith("image/") ? URL.createObjectURL(file) : null
    );
    setPreviews(urls);
    return () => {
      urls.forEach(url => url && URL.revokeObjectURL(url));
    };
  }, [medias]);

  // Window-level drag-and-drop so any drag over the page shows the overlay
  useEffect(() => {
    if (ticketStatus !== "open") return;

    const onDragEnter = e => {
      dragCounterRef.current++;
      if (e.dataTransfer?.types?.includes("Files")) setIsDragging(true);
    };

    const onDragLeave = () => {
      dragCounterRef.current--;
      if (dragCounterRef.current <= 0) {
        dragCounterRef.current = 0;
        setIsDragging(false);
      }
    };

    const onDragOver = e => {
      e.preventDefault();
    };

    const onDrop = e => {
      e.preventDefault();
      dragCounterRef.current = 0;
      setIsDragging(false);
      if (e.dataTransfer?.files?.length > 0) {
        const dropped = Array.from(e.dataTransfer.files);
        setMedias(prev => [...prev, ...dropped]);
      }
    };

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);

    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
    };
  }, [ticketStatus]);

  useEffect(() => {
    inputRef.current.focus();
  }, [replyingMessage]);

  useEffect(() => {
    inputRef.current.focus();
    return () => {
      setInputMessage("");
      setShowEmoji(false);
      setMedias([]);
      setReplyingMessage(null);
    };
  }, [ticketId, setReplyingMessage]);

  const handleChangeInput = e => {
    setInputMessage(e.target.value);
    handleLoadQuickAnswer(e.target.value);
  };

  const handleQuickAnswersClick = value => {
    setInputMessage(value);
    setTypeBar(false);
  };

  const handleAddEmoji = e => {
    let emoji = e.native;
    setInputMessage(prevState => prevState + emoji);
  };

  const handleChangeMedias = e => {
    if (!e.target.files) return;
    const selected = Array.from(e.target.files);
    setMedias(selected);
    e.target.value = "";
  };

  const handleAddMoreMedias = e => {
    if (!e.target.files) return;
    const added = Array.from(e.target.files);
    setMedias(prev => [...prev, ...added]);
    e.target.value = "";
  };

  // Support pasting multiple files (e.g. Ctrl+V screenshots or copied files)
  const handleInputPaste = e => {
    if (e.clipboardData.files.length > 0) {
      const pasted = Array.from(e.clipboardData.files);
      setMedias(prev => [...prev, ...pasted]);
    }
  };

  const handleRemoveMedia = index => {
    setMedias(prev => prev.filter((_, i) => i !== index));
  };

  const handleUploadMedia = async e => {
    setLoading(true);
    e.preventDefault();

    const formData = new FormData();
    formData.append("fromMe", true);
    medias.forEach(media => {
      formData.append("medias", media);
      formData.append("body", media.name);
    });

    try {
      await api.post(`/messages/${ticketId}`, formData);
    } catch (err) {
      toastError(err);
    }

    setLoading(false);
    setMedias([]);
  };

  const handleSendMessage = async () => {
    if (inputMessage.trim() === "") return;
    setLoading(true);

    const message = {
      read: 1,
      fromMe: true,
      mediaUrl: "",
      body: signMessage
        ? `*${user?.name}:*\n${inputMessage.trim()}`
        : inputMessage.trim(),
      quotedMsg: replyingMessage,
    };
    try {
      await api.post(`/messages/${ticketId}`, message);
    } catch (err) {
      toastError(err);
    }

    setInputMessage("");
    setShowEmoji(false);
    setLoading(false);
    setReplyingMessage(null);
  };

  const handleStartRecording = async () => {
    setLoading(true);
    try {
      const recorder = await initRecorder();
      if (!recorder) throw new Error("Recorder not available");
      await navigator.mediaDevices.getUserMedia({ audio: true });
      await recorder.start();
      setRecording(true);
      setLoading(false);
    } catch (err) {
      toastError(err);
      setLoading(false);
    }
  };

  const handleLoadQuickAnswer = async value => {
    if (value && value.indexOf("/") === 0) {
      try {
        const { data } = await api.get("/quickAnswers/", {
          params: { searchParam: inputMessage.substring(1) },
        });
        setQuickAnswer(data.quickAnswers);
        if (data.quickAnswers.length > 0) {
          setTypeBar(true);
        } else {
          setTypeBar(false);
        }
      } catch (err) {
        setTypeBar(false);
      }
    } else {
      setTypeBar(false);
    }
  };

  const handleUploadAudio = async () => {
    setLoading(true);
    try {
      const recorder = await initRecorder();
      if (!recorder) throw new Error("Recorder not available");
      const [, blob] = await recorder.stop().getMp3();
      if (blob.size < 10000) {
        setLoading(false);
        setRecording(false);
        return;
      }

      const formData = new FormData();
      const filename = `${new Date().getTime()}.mp3`;
      formData.append("medias", blob, filename);
      formData.append("body", filename);
      formData.append("fromMe", true);

      await api.post(`/messages/${ticketId}`, formData);
    } catch (err) {
      toastError(err);
    }

    setRecording(false);
    setLoading(false);
  };

  const handleCancelAudio = async () => {
    try {
      const recorder = await initRecorder();
      if (recorder) await recorder.stop().getMp3();
      setRecording(false);
    } catch (err) {
      toastError(err);
    }
  };

  const handleOpenMenuClick = event => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuItemClick = () => {
    setAnchorEl(null);
  };

  const renderReplyingMessage = message => {
    return (
      <div className={classes.replyginMsgWrapper}>
        <div className={classes.replyginMsgContainer}>
          <span
            className={clsx(classes.replyginContactMsgSideColor, {
              [classes.replyginSelfMsgSideColor]: !message.fromMe,
            })}
          ></span>
          <div className={classes.replyginMsgBody}>
            {!message.fromMe && (
              <span className={classes.messageContactName}>
                {message.contact?.name}
              </span>
            )}
            {message.body}
          </div>
        </div>
        <IconButton
          aria-label="showRecorder"
          component="span"
          disabled={loading || ticketStatus !== "open"}
          onClick={() => setReplyingMessage(null)}
        >
          <ClearIcon className={classes.sendMessageIcons} />
        </IconButton>
      </div>
    );
  };

  // --- File preview grid shown when medias are queued ---
  if (medias.length > 0)
    return (
      <>
        {isDragging && (
          <div className={classes.dragOverlay}>
            <div className={classes.dragOverlayBox}>
              <CloudUploadIcon className={classes.dragOverlayIcon} />
              <Typography className={classes.dragOverlayText}>
                Solte os arquivos aqui
              </Typography>
            </div>
          </div>
        )}

        {/* Hidden input for "add more files" */}
        <input
          multiple
          type="file"
          ref={addMoreInputRef}
          className={classes.uploadInput}
          onChange={handleAddMoreMedias}
        />

        <Paper elevation={0} square className={classes.viewMediaInputWrapper}>
          <div className={classes.mediaPreviewHeader}>
            <Typography className={classes.mediaPreviewTitle}>
              {medias.length === 1
                ? "1 arquivo selecionado"
                : `${medias.length} arquivos selecionados`}
            </Typography>
            <div className={classes.mediaPreviewActions}>
              <IconButton
                size="small"
                aria-label="cancel-upload"
                onClick={() => setMedias([])}
                disabled={loading}
              >
                <CancelIcon className={classes.sendMessageIcons} />
              </IconButton>
              <IconButton
                size="small"
                aria-label="send-upload"
                onClick={handleUploadMedia}
                disabled={loading}
              >
                {loading ? (
                  <CircularProgress size={20} style={{ color: green[500] }} />
                ) : (
                  <SendIcon style={{ color: green[600] }} />
                )}
              </IconButton>
            </div>
          </div>

          <div className={classes.mediaPreviewGrid}>
            {medias.map((file, index) => (
              <div key={index} className={classes.mediaPreviewCard}>
                {previews[index] ? (
                  <img
                    src={previews[index]}
                    alt={file.name}
                    className={classes.mediaPreviewThumb}
                  />
                ) : (
                  <InsertDriveFileIcon className={classes.mediaPreviewFileIcon} />
                )}
                <span className={classes.mediaPreviewName} title={file.name}>
                  {file.name}
                </span>
                <button
                  className={classes.mediaPreviewRemoveBtn}
                  onClick={() => handleRemoveMedia(index)}
                  disabled={loading}
                >
                  <ClearIcon />
                </button>
              </div>
            ))}

            {/* Add more card */}
            <div
              className={classes.mediaPreviewAddCard}
              onClick={() => !loading && addMoreInputRef.current?.click()}
              title="Adicionar mais arquivos"
            >
              <AddIcon style={{ fontSize: 28 }} />
              <span style={{ fontSize: 11, marginTop: 2 }}>Adicionar</span>
            </div>
          </div>
        </Paper>
      </>
    );

  return (
    <>
      {/* Full-screen drag overlay */}
      {isDragging && (
        <div className={classes.dragOverlay}>
          <div className={classes.dragOverlayBox}>
            <CloudUploadIcon className={classes.dragOverlayIcon} />
            <Typography className={classes.dragOverlayText}>
              Solte os arquivos aqui
            </Typography>
          </div>
        </div>
      )}

      <Paper square elevation={0} className={classes.mainWrapper}>
        {replyingMessage && renderReplyingMessage(replyingMessage)}
        <div className={classes.newMessageBox}>
          <Hidden only={["sm", "xs"]}>
            <IconButton
              aria-label="emojiPicker"
              component="span"
              disabled={loading || recording || ticketStatus !== "open"}
              onClick={e => setShowEmoji(prevState => !prevState)}
            >
              <MoodIcon className={classes.sendMessageIcons} />
            </IconButton>
            {showEmoji ? (
              <div className={classes.emojiBox}>
                <ClickAwayListener onClickAway={() => setShowEmoji(false)}>
                  <Picker
                    perLine={16}
                    showPreview={false}
                    showSkinTones={false}
                    onSelect={handleAddEmoji}
                  />
                </ClickAwayListener>
              </div>
            ) : null}

            <input
              multiple
              type="file"
              id="upload-button"
              disabled={loading || recording || ticketStatus !== "open"}
              className={classes.uploadInput}
              onChange={handleChangeMedias}
            />
            <label htmlFor="upload-button">
              <IconButton
                aria-label="upload"
                component="span"
                disabled={loading || recording || ticketStatus !== "open"}
              >
                <AttachFileIcon className={classes.sendMessageIcons} />
              </IconButton>
            </label>
          </Hidden>

          <Hidden only={["md", "lg", "xl"]}>
            <IconButton
              aria-controls="simple-menu"
              aria-haspopup="true"
              onClick={handleOpenMenuClick}
            >
              <MoreVert />
            </IconButton>
            <Menu
              id="simple-menu"
              keepMounted
              anchorEl={anchorEl}
              open={Boolean(anchorEl)}
              onClose={handleMenuItemClick}
            >
              <MenuItem onClick={handleMenuItemClick}>
                <IconButton
                  aria-label="emojiPicker"
                  component="span"
                  disabled={loading || recording || ticketStatus !== "open"}
                  onClick={e => setShowEmoji(prevState => !prevState)}
                >
                  <MoodIcon className={classes.sendMessageIcons} />
                </IconButton>
              </MenuItem>
              <MenuItem onClick={handleMenuItemClick}>
                <input
                  multiple
                  type="file"
                  id="upload-button-mobile"
                  disabled={loading || recording || ticketStatus !== "open"}
                  className={classes.uploadInput}
                  onChange={handleChangeMedias}
                />
                <label htmlFor="upload-button-mobile">
                  <IconButton
                    aria-label="upload"
                    component="span"
                    disabled={loading || recording || ticketStatus !== "open"}
                  >
                    <AttachFileIcon className={classes.sendMessageIcons} />
                  </IconButton>
                </label>
              </MenuItem>
            </Menu>
          </Hidden>

          <div className={classes.messageInputWrapper}>
            <InputBase
              inputRef={input => {
                input && input.focus();
                input && (inputRef.current = input);
              }}
              className={classes.messageInput}
              placeholder={
                ticketStatus === "open"
                  ? i18n.t("messagesInput.placeholderOpen")
                  : i18n.t("messagesInput.placeholderClosed")
              }
              multiline
              maxRows={5}
              value={inputMessage}
              onChange={handleChangeInput}
              disabled={recording || loading || ticketStatus !== "open"}
              onPaste={e => {
                ticketStatus === "open" && handleInputPaste(e);
              }}
              onKeyPress={e => {
                if (loading || e.shiftKey) return;
                else if (e.key === "Enter") {
                  handleSendMessage();
                }
              }}
            />
            {typeBar ? (
              <ul className={classes.messageQuickAnswersWrapper}>
                {quickAnswers.map((value, index) => {
                  return (
                    <li
                      className={classes.messageQuickAnswersWrapperItem}
                      key={index}
                    >
                      {/* eslint-disable-next-line jsx-a11y/anchor-is-valid */}
                      <a onClick={() => handleQuickAnswersClick(value.message)}>
                        {`${value.shortcut} - ${value.message}`}
                      </a>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div></div>
            )}
          </div>

          {inputMessage ? (
            <IconButton
              aria-label="sendMessage"
              component="span"
              onClick={handleSendMessage}
              disabled={loading}
            >
              <SendIcon className={classes.sendMessageIcons} />
            </IconButton>
          ) : recording ? (
            <div className={classes.recorderWrapper}>
              <IconButton
                aria-label="cancelRecording"
                component="span"
                fontSize="large"
                disabled={loading}
                onClick={handleCancelAudio}
              >
                <HighlightOffIcon className={classes.cancelAudioIcon} />
              </IconButton>
              {loading ? (
                <div>
                  <CircularProgress className={classes.audioLoading} />
                </div>
              ) : (
                <RecordingTimer />
              )}
              <IconButton
                aria-label="sendRecordedAudio"
                component="span"
                onClick={handleUploadAudio}
                disabled={loading}
              >
                <CheckCircleOutlineIcon className={classes.sendAudioIcon} />
              </IconButton>
            </div>
          ) : (
            <IconButton
              aria-label="showRecorder"
              component="span"
              disabled={loading || ticketStatus !== "open"}
              onClick={handleStartRecording}
            >
              <MicIcon className={classes.sendMessageIcons} />
            </IconButton>
          )}
        </div>
      </Paper>
    </>
  );
};

export default MessageInput;
