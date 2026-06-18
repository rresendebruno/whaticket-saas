import React, { useState, useEffect, useReducer, useRef } from "react";

import { isSameDay, parseISO, format } from "date-fns";
import openSocket from "../../services/socket-io";
import clsx from "clsx";

import { green } from "@material-ui/core/colors";
import {
  Button,
  Checkbox,
  CircularProgress,
  Divider,
  IconButton,
  makeStyles,
  Paper,
  Tooltip,
  Typography,
} from "@material-ui/core";
import {
  AccessTime,
  Block,
  CheckBoxOutlineBlank,
  Close,
  Done,
  DoneAll,
  ExpandMore,
  GetApp,
  Lock,
  Reply,
} from "@material-ui/icons";

import MarkdownWrapper from "../MarkdownWrapper";
import VcardPreview from "../VcardPreview";
import LocationPreview from "../LocationPreview";
import ModalImageCors from "../ModalImageCors";
import MessageOptionsMenu from "../MessageOptionsMenu";
import ForwardMessageModal from "../ForwardMessageModal";
import whatsBackground from "../../assets/wa-background.png";

import api from "../../services/api";
import toastError from "../../errors/toastError";
import Audio from "../Audio";

const useStyles = makeStyles((theme) => ({
  messagesListWrapper: {
    overflow: "hidden",
    position: "relative",
    display: "flex",
    flexDirection: "column",
    flexGrow: 1,
  },

  messagesList: {
    backgroundImage: theme.palette.type === "dark" ? "none" : `url(${whatsBackground})`,
    backgroundColor: theme.palette.type === "dark" ? "#0d1117" : "transparent",
    display: "flex",
    flexDirection: "column",
    flexGrow: 1,
    padding: "20px 20px 20px 20px",
    overflowY: "scroll",
    [theme.breakpoints.down("sm")]: {
      paddingBottom: "90px",
    },
    ...theme.scrollbarStyles,
  },

  circleLoading: {
    color: green[500],
    position: "absolute",
    opacity: "70%",
    top: 0,
    left: "50%",
    marginTop: 12,
  },

  messageLeft: {
    marginRight: 20,
    marginTop: 2,
    minWidth: 100,
    maxWidth: 600,
    height: "auto",
    display: "block",
    position: "relative",
    "&:hover #messageActionsButton": {
      display: "flex",
      position: "absolute",
      top: 0,
      right: 0,
    },

    whiteSpace: "pre-wrap",
    backgroundColor: theme.palette.type === "dark" ? "#1e2a35" : "#ffffff",
    color: theme.palette.type === "dark" ? "#e0e0e0" : "#303030",
    alignSelf: "flex-start",
    borderTopLeftRadius: 0,
    borderTopRightRadius: 8,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    paddingLeft: 5,
    paddingRight: 5,
    paddingTop: 5,
    paddingBottom: 0,
    boxShadow: "0 1px 1px #b3b3b3",
  },

  quotedContainerLeft: {
    margin: "-3px -80px 6px -6px",
    overflow: "hidden",
    backgroundColor: theme.palette.type === "dark" ? "#253341" : "#f0f0f0",
    borderRadius: "7.5px",
    display: "flex",
    position: "relative",
  },

  quotedMsg: {
    padding: 10,
    maxWidth: 300,
    height: "auto",
    display: "block",
    whiteSpace: "pre-wrap",
    overflow: "hidden",
  },

  quotedSideColorLeft: {
    flex: "none",
    width: "4px",
    backgroundColor: "#6bcbef",
  },

  messageRight: {
    marginLeft: 20,
    marginTop: 2,
    minWidth: 100,
    maxWidth: 600,
    height: "auto",
    display: "block",
    position: "relative",
    "&:hover #messageActionsButton": {
      display: "flex",
      position: "absolute",
      top: 0,
      right: 0,
    },

    whiteSpace: "pre-wrap",
    backgroundColor: theme.palette.type === "dark" ? "#1a3a2a" : "#dcf8c6",
    color: theme.palette.type === "dark" ? "#e0e0e0" : "#303030",
    alignSelf: "flex-end",
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 0,
    paddingLeft: 5,
    paddingRight: 5,
    paddingTop: 5,
    paddingBottom: 0,
    boxShadow: "0 1px 1px #b3b3b3",
  },

  quotedContainerRight: {
    margin: "-3px -80px 6px -6px",
    overflowY: "hidden",
    backgroundColor: theme.palette.type === "dark" ? "#1e3d2a" : "#cfe9ba",
    borderRadius: "7.5px",
    display: "flex",
    position: "relative",
  },

  quotedMsgRight: {
    padding: 10,
    maxWidth: 300,
    height: "auto",
    whiteSpace: "pre-wrap",
  },

  quotedSideColorRight: {
    flex: "none",
    width: "4px",
    backgroundColor: "#35cd96",
  },

  messageActionsButton: {
    display: "none",
    position: "relative",
    color: "#999",
    zIndex: 1,
    backgroundColor: "inherit",
    opacity: "90%",
    "&:hover, &.Mui-focusVisible": { backgroundColor: "inherit" },
  },

  messageContactName: {
    display: "flex",
    color: "#6bcbef",
    fontWeight: 500,
  },

  textContentItem: {
    overflowWrap: "break-word",
    padding: "3px 80px 6px 6px",
  },

  textContentItemDeleted: {
    fontStyle: "italic",
    color: "rgba(0, 0, 0, 0.36)",
    overflowWrap: "break-word",
    padding: "3px 80px 6px 6px",
  },

  messageMedia: {
    objectFit: "cover",
    width: 250,
    height: 200,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
  },

  timestamp: {
    fontSize: 11,
    position: "absolute",
    bottom: 0,
    right: 5,
    color: "#999",
  },

  dailyTimestamp: {
    alignItems: "center",
    textAlign: "center",
    alignSelf: "center",
    width: "110px",
    backgroundColor: theme.palette.type === "dark" ? "#1c2b38" : "#e1f3fb",
    margin: "10px",
    borderRadius: "10px",
    boxShadow: "0 1px 1px #b3b3b3",
  },

  dailyTimestampText: {
    color: theme.palette.type === "dark" ? "#aaaaaa" : "#808888",
    padding: 8,
    alignSelf: "center",
    marginLeft: "0px",
  },

  ackIcons: {
    fontSize: 18,
    verticalAlign: "middle",
    marginLeft: 4,
  },

  deletedIcon: {
    fontSize: 18,
    verticalAlign: "middle",
    marginRight: 4,
  },

  ackDoneAllIcon: {
    color: green[500],
    fontSize: 18,
    verticalAlign: "middle",
    marginLeft: 4,
  },

  downloadMedia: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "inherit",
    padding: 10,
  },

  selectionBar: {
    position: "sticky",
    bottom: 0,
    zIndex: 10,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 16px",
    backgroundColor: theme.palette.background.paper,
    boxShadow: "0 -2px 8px rgba(0,0,0,0.15)",
  },

  selectionBarActions: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },

  messageSelected: {
    backgroundColor:
      theme.palette.type === "dark"
        ? "rgba(255,255,255,0.08)"
        : "rgba(0,0,0,0.06)",
    borderRadius: 8,
  },

  messageRow: {
    display: "flex",
    alignItems: "center",
  },

  checkboxCell: {
    display: "flex",
    alignItems: "center",
    paddingRight: 4,
    paddingLeft: 4,
    cursor: "pointer",
  },

  internalNote: {
    alignSelf: "center",
    maxWidth: 520,
    width: "fit-content",
    margin: "4px auto",
    padding: "6px 14px",
    borderRadius: 8,
    backgroundColor: theme.palette.type === "dark" ? "#2a2010" : "#fff8e1",
    border: `1px dashed ${theme.palette.type === "dark" ? "#6b5c2a" : "#f0c040"}`,
    display: "flex",
    alignItems: "flex-start",
    gap: 6,
  },

  internalNoteText: {
    fontSize: "0.82em",
    color: theme.palette.type === "dark" ? "#c8a84b" : "#7a5f00",
    fontStyle: "italic",
    lineHeight: 1.4,
  },

  internalNoteIcon: {
    fontSize: "0.9em",
    color: theme.palette.type === "dark" ? "#c8a84b" : "#c8970a",
    marginTop: 1,
    flexShrink: 0,
  },
}));

const reducer = (state, action) => {
  if (action.type === "LOAD_MESSAGES") {
    const messages = action.payload;
    const newMessages = [];

    messages.forEach((message) => {
      const messageIndex = state.findIndex((m) => m.id === message.id);
      if (messageIndex !== -1) {
        state[messageIndex] = message;
      } else {
        newMessages.push(message);
      }
    });

    return [...newMessages, ...state];
  }

  if (action.type === "ADD_MESSAGE") {
    const newMessage = action.payload;
    const messageIndex = state.findIndex((m) => m.id === newMessage.id);

    if (messageIndex !== -1) {
      state[messageIndex] = newMessage;
    } else {
      state.push(newMessage);
    }

    return [...state];
  }

  if (action.type === "UPDATE_MESSAGE") {
    const messageToUpdate = action.payload;
    const messageIndex = state.findIndex((m) => m.id === messageToUpdate.id);

    if (messageIndex !== -1) {
      state[messageIndex] = messageToUpdate;
    }

    return [...state];
  }

  if (action.type === "RESET") {
    return [];
  }
};

const MessagesList = ({ ticketId, isGroup }) => {
  const classes = useStyles();

  const [messagesList, dispatch] = useReducer(reducer, []);
  const [pageNumber, setPageNumber] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const lastMessageRef = useRef();

  const [selectedMessage, setSelectedMessage] = useState({});
  const [anchorEl, setAnchorEl] = useState(null);
  const messageOptionsMenuOpen = Boolean(anchorEl);
  const currentTicketId = useRef(ticketId);

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMessages, setSelectedMessages] = useState(new Set());
  const [forwardModalOpen, setForwardModalOpen] = useState(false);

  useEffect(() => {
    dispatch({ type: "RESET" });
    setPageNumber(1);

    currentTicketId.current = ticketId;
  }, [ticketId]);

  useEffect(() => {
    setLoading(true);
    const delayDebounceFn = setTimeout(() => {
      const fetchMessages = async () => {
        try {
          const { data } = await api.get("/messages/" + ticketId, {
            params: { pageNumber },
          });

          if (currentTicketId.current === ticketId) {
            dispatch({ type: "LOAD_MESSAGES", payload: data.messages });
            setHasMore(data.hasMore);
            setLoading(false);
          }

          if (pageNumber === 1 && data.messages.length > 1) {
            scrollToBottom();
          }
        } catch (err) {
          setLoading(false);
          toastError(err);
        }
      };
      fetchMessages();
    }, 500);
    return () => {
      clearTimeout(delayDebounceFn);
    };
  }, [pageNumber, ticketId]);

  useEffect(() => {
    const socket = openSocket();

    socket.on("connect", () => socket.emit("joinChatBox", ticketId));

    socket.on("appMessage", (data) => {
      if (data.action === "create") {
        dispatch({ type: "ADD_MESSAGE", payload: data.message });
        scrollToBottom();
      }

      if (data.action === "update") {
        dispatch({ type: "UPDATE_MESSAGE", payload: data.message });
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [ticketId]);

  const loadMore = () => {
    setPageNumber((prevPageNumber) => prevPageNumber + 1);
  };

  const scrollToBottom = () => {
    if (lastMessageRef.current) {
      lastMessageRef.current.scrollIntoView({});
    }
  };

  const handleScroll = (e) => {
    if (!hasMore) return;
    const { scrollTop } = e.currentTarget;

    if (scrollTop === 0) {
      document.getElementById("messagesList").scrollTop = 1;
    }

    if (loading) {
      return;
    }

    if (scrollTop < 50) {
      loadMore();
    }
  };

  const handleOpenMessageOptionsMenu = (e, message) => {
    setAnchorEl(e.currentTarget);
    setSelectedMessage(message);
  };

  const handleCloseMessageOptionsMenu = (e) => {
    setAnchorEl(null);
  };

  const handleStartForward = (message) => {
    setSelectionMode(true);
    setSelectedMessages(new Set([message.id]));
  };

  const handleToggleSelection = (messageId) => {
    setSelectedMessages((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) {
        next.delete(messageId);
        if (next.size === 0) setSelectionMode(false);
      } else {
        next.add(messageId);
      }
      return next;
    });
  };

  const handleExitSelection = () => {
    setSelectionMode(false);
    setSelectedMessages(new Set());
  };

  const checkMessageMedia = (message) => {
    if (message.mediaType === "location" && message.body.split('|').length >= 2) {
      let locationParts = message.body.split('|')
      let imageLocation = locationParts[0]
      let linkLocation = locationParts[1]

      let descriptionLocation = null

      if (locationParts.length > 2)
        descriptionLocation = message.body.split('|')[2]

      return <LocationPreview image={imageLocation} link={linkLocation} description={descriptionLocation} />
    }
    else if (message.mediaType === "vcard") {
      //console.log("vcard")
      //console.log(message)
      let array = message.body.split("\n");
      let obj = [];
      let contact = "";
      for (let index = 0; index < array.length; index++) {
        const v = array[index];
        let values = v.split(":");
        for (let ind = 0; ind < values.length; ind++) {
          if (values[ind].indexOf("+") !== -1) {
            obj.push({ number: values[ind] });
          }
          if (values[ind].indexOf("FN") !== -1) {
            contact = values[ind + 1];
          }
        }
      }
      return <VcardPreview contact={contact} numbers={obj[0]?.number} />
    }
    /*else if (message.mediaType === "multi_vcard") {
      console.log("multi_vcard")
      console.log(message)
    	
      if(message.body !== null && message.body !== "") {
        let newBody = JSON.parse(message.body)
        return (
          <>
            {
            newBody.map(v => (
              <VcardPreview contact={v.name} numbers={v.number} />
            ))
            }
          </>
        )
      } else return (<></>)
    }*/
    else if (message.mediaType === "image") {
      return <ModalImageCors imageUrl={message.mediaUrl} />;
    } else if (message.mediaType === "audio") {
      return <Audio url={message.mediaUrl} />
    } else if (message.mediaType === "video") {
      return (
        <video
          className={classes.messageMedia}
          src={message.mediaUrl}
          controls
        />
      );
    } else {
      return (
        <>
          <div className={classes.downloadMedia}>
            <Button
              startIcon={<GetApp />}
              color="primary"
              variant="outlined"
              target="_blank"
              href={message.mediaUrl}
              download={message.body || true}
            >
              Download
            </Button>
          </div>
          <Divider />
        </>
      );
    }
  };

  const renderMessageAck = (message) => {
    if (message.ack === 0) {
      return <AccessTime fontSize="small" className={classes.ackIcons} />;
    }
    if (message.ack === 1) {
      return <Done fontSize="small" className={classes.ackIcons} />;
    }
    if (message.ack === 2) {
      return <DoneAll fontSize="small" className={classes.ackIcons} />;
    }
    if (message.ack === 3 || message.ack === 4) {
      return <DoneAll fontSize="small" className={classes.ackDoneAllIcon} />;
    }
  };

  const renderDailyTimestamps = (message, index) => {
    if (index === 0) {
      return (
        <span
          className={classes.dailyTimestamp}
          key={`timestamp-${message.id}`}
        >
          <div className={classes.dailyTimestampText}>
            {format(parseISO(messagesList[index].createdAt), "dd/MM/yyyy")}
          </div>
        </span>
      );
    }
    if (index < messagesList.length - 1) {
      let messageDay = parseISO(messagesList[index].createdAt);
      let previousMessageDay = parseISO(messagesList[index - 1].createdAt);

      if (!isSameDay(messageDay, previousMessageDay)) {
        return (
          <span
            className={classes.dailyTimestamp}
            key={`timestamp-${message.id}`}
          >
            <div className={classes.dailyTimestampText}>
              {format(parseISO(messagesList[index].createdAt), "dd/MM/yyyy")}
            </div>
          </span>
        );
      }
    }
    if (index === messagesList.length - 1) {
      return (
        <div
          key={`ref-${message.createdAt}`}
          ref={lastMessageRef}
          style={{ float: "left", clear: "both" }}
        />
      );
    }
  };

  const renderMessageDivider = (message, index) => {
    if (index < messagesList.length && index > 0) {
      let messageUser = messagesList[index].fromMe;
      let previousMessageUser = messagesList[index - 1].fromMe;

      if (messageUser !== previousMessageUser) {
        return (
          <span style={{ marginTop: 16 }} key={`divider-${message.id}`}></span>
        );
      }
    }
  };

  const renderQuotedMessage = (message) => {
    return (
      <div
        className={clsx(classes.quotedContainerLeft, {
          [classes.quotedContainerRight]: message.fromMe,
        })}
      >
        <span
          className={clsx(classes.quotedSideColorLeft, {
            [classes.quotedSideColorRight]: message.quotedMsg?.fromMe,
          })}
        ></span>
        <div className={classes.quotedMsg}>
          {!message.quotedMsg?.fromMe && (
            <span className={classes.messageContactName}>
              {message.quotedMsg?.contact?.name}
            </span>
          )}
          {message.quotedMsg?.body}
        </div>
      </div>
    );
  };

  const renderInternalNote = (message, index) => (
    <React.Fragment key={message.id}>
      {renderDailyTimestamps(message, index)}
      <div className={classes.internalNote}>
        <Lock className={classes.internalNoteIcon} fontSize="inherit" />
        <span className={classes.internalNoteText}>
          <MarkdownWrapper>{message.body}</MarkdownWrapper>
        </span>
      </div>
    </React.Fragment>
  );

  const renderMessages = () => {
    if (messagesList.length > 0) {
      const viewMessagesList = messagesList.map((message, index) => {
        // Internal notes are only visible to agents — render with special style
        if (message.mediaType === "note") {
          return renderInternalNote(message, index);
        }

        const isSelected = selectedMessages.has(message.id);

        if (!message.fromMe) {
          return (
            <React.Fragment key={message.id}>
              {renderDailyTimestamps(message, index)}
              {renderMessageDivider(message, index)}
              <div
                className={clsx(classes.messageRow, {
                  [classes.messageSelected]: isSelected && selectionMode,
                })}
                onClick={selectionMode ? () => handleToggleSelection(message.id) : undefined}
                style={selectionMode ? { cursor: "pointer" } : undefined}
              >
                {selectionMode && (
                  <div className={classes.checkboxCell}>
                    <Checkbox
                      size="small"
                      checked={isSelected}
                      onChange={() => handleToggleSelection(message.id)}
                      onClick={(e) => e.stopPropagation()}
                      color="primary"
                    />
                  </div>
                )}
                <div className={classes.messageLeft}>
                  {!selectionMode && (
                    <IconButton
                      variant="contained"
                      size="small"
                      id="messageActionsButton"
                      disabled={message.isDeleted}
                      className={classes.messageActionsButton}
                      onClick={(e) => handleOpenMessageOptionsMenu(e, message)}
                    >
                      <ExpandMore />
                    </IconButton>
                  )}
                  {isGroup && (
                    <span className={classes.messageContactName}>
                      {message.contact?.name}
                    </span>
                  )}
                  {(message.mediaUrl || message.mediaType === "location" || message.mediaType === "vcard"
                    //|| message.mediaType === "multi_vcard"
                  ) && checkMessageMedia(message)}
                  <div className={classes.textContentItem}>
                    {message.isDeleted && (
                      <span style={{ display: "flex", alignItems: "center", color: "rgba(0,0,0,0.36)", fontStyle: "italic", fontSize: "0.82em", marginBottom: 2 }}>
                        <Block color="disabled" fontSize="small" style={{ marginRight: 4, fontSize: "0.95em" }} />
                        Mensagem apagada pelo cliente
                      </span>
                    )}
                    {message.quotedMsg && renderQuotedMessage(message)}
                    <MarkdownWrapper>{message.body}</MarkdownWrapper>
                    <span className={classes.timestamp}>
                      {format(parseISO(message.createdAt), "HH:mm")}
                    </span>
                  </div>
                </div>
              </div>
            </React.Fragment>
          );
        } else {
          return (
            <React.Fragment key={message.id}>
              {renderDailyTimestamps(message, index)}
              {renderMessageDivider(message, index)}
              <div
                className={clsx(classes.messageRow, {
                  [classes.messageSelected]: isSelected && selectionMode,
                })}
                style={{ justifyContent: "flex-end", ...(selectionMode && { cursor: "pointer" }) }}
                onClick={selectionMode ? () => handleToggleSelection(message.id) : undefined}
              >
                <div className={classes.messageRight}>
                  {!selectionMode && (
                    <IconButton
                      variant="contained"
                      size="small"
                      id="messageActionsButton"
                      disabled={message.isDeleted}
                      className={classes.messageActionsButton}
                      onClick={(e) => handleOpenMessageOptionsMenu(e, message)}
                    >
                      <ExpandMore />
                    </IconButton>
                  )}
                  {!message.isDeleted && (message.mediaUrl || message.mediaType === "location" || message.mediaType === "vcard"
                    //|| message.mediaType === "multi_vcard"
                  ) && checkMessageMedia(message)}
                  <div
                    className={clsx(classes.textContentItem, {
                      [classes.textContentItemDeleted]: message.isDeleted,
                    })}
                  >
                    {message.isDeleted ? (
                      (() => {
                        const match = message.body?.match(/^\[DELETED_BY:(.+?)\]([\s\S]*)$/);
                        const deletedByName = match ? match[1] : message.body;
                        const originalBody = match ? match[2] : null;
                        return (
                          <>
                            <span style={{ display: "flex", alignItems: "center", gap: 4, color: "rgba(0,0,0,0.45)", fontStyle: "italic", fontSize: "0.85em", marginBottom: originalBody ? 4 : 0 }}>
                              <Block color="disabled" fontSize="small" className={classes.deletedIcon} />
                              Mensagem apagada por {deletedByName}
                            </span>
                            {originalBody && <MarkdownWrapper>{originalBody}</MarkdownWrapper>}
                          </>
                        );
                      })()
                    ) : (
                      <>
                        {message.quotedMsg && renderQuotedMessage(message)}
                        <MarkdownWrapper>{message.body}</MarkdownWrapper>
                      </>
                    )}
                    <span className={classes.timestamp}>
                      {format(parseISO(message.createdAt), "HH:mm")}
                      {renderMessageAck(message)}
                    </span>
                  </div>
                </div>
                {selectionMode && (
                  <div className={classes.checkboxCell}>
                    <Checkbox
                      size="small"
                      checked={isSelected}
                      onChange={() => handleToggleSelection(message.id)}
                      onClick={(e) => e.stopPropagation()}
                      color="primary"
                    />
                  </div>
                )}
              </div>
            </React.Fragment>
          );
        }
      });
      return viewMessagesList;
    } else {
      return <div>Say hello to your new contact!</div>;
    }
  };

  return (
    <div className={classes.messagesListWrapper}>
      <MessageOptionsMenu
        message={selectedMessage}
        anchorEl={anchorEl}
        menuOpen={messageOptionsMenuOpen}
        handleClose={handleCloseMessageOptionsMenu}
        onStartForward={handleStartForward}
      />
      <ForwardMessageModal
        open={forwardModalOpen}
        onClose={() => {
          setForwardModalOpen(false);
          handleExitSelection();
        }}
        messageIds={Array.from(selectedMessages)}
      />
      <div
        id="messagesList"
        className={classes.messagesList}
        onScroll={handleScroll}
      >
        {messagesList.length > 0 ? renderMessages() : []}
      </div>
      {loading && (
        <div>
          <CircularProgress className={classes.circleLoading} />
        </div>
      )}
      {selectionMode && (
        <Paper className={classes.selectionBar} elevation={4}>
          <Typography variant="body2">
            {selectedMessages.size === 1
              ? "1 mensagem selecionada"
              : `${selectedMessages.size} mensagens selecionadas`}
          </Typography>
          <div className={classes.selectionBarActions}>
            <Button
              size="small"
              startIcon={<Close />}
              onClick={handleExitSelection}
            >
              Cancelar
            </Button>
            <Button
              size="small"
              variant="contained"
              color="primary"
              startIcon={<Reply style={{ transform: "scaleX(-1)" }} />}
              disabled={selectedMessages.size === 0}
              onClick={() => setForwardModalOpen(true)}
            >
              Encaminhar
            </Button>
          </div>
        </Paper>
      )}
    </div>
  );
};

export default MessagesList;