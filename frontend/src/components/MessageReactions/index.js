import React from "react";
import { makeStyles } from "@material-ui/core/styles";
import Tooltip from "@material-ui/core/Tooltip";

const useStyles = makeStyles(theme => ({
  wrapper: {
    position: "absolute",
    bottom: -14,
    display: "flex",
    gap: 2,
    zIndex: 1,
  },
  left: { left: 8 },
  right: { right: 8 },
  pill: {
    display: "inline-flex",
    alignItems: "center",
    gap: 2,
    padding: "1px 6px",
    borderRadius: 12,
    fontSize: 14,
    lineHeight: "20px",
    background: theme.palette.background.paper,
    border: `1px solid ${theme.palette.divider}`,
    boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
    cursor: "default",
    userSelect: "none",
  },
  mine: {
    borderColor: theme.palette.primary.main,
    cursor: "pointer",
  },
  count: {
    fontSize: 11,
    color: theme.palette.text.secondary,
  },
}));

// Groups reactions by emoji: [{ emoji, names, mine }]
const groupReactions = reactions => {
  const map = new Map();
  reactions.forEach(r => {
    if (!r?.emoji) return;
    const entry = map.get(r.emoji) || { emoji: r.emoji, names: [], mine: false };
    const isMine = r.senderNumber === "me";
    entry.names.push(isMine ? r.senderName ? `Você (${r.senderName})` : "Você" : r.senderName || r.senderNumber);
    if (isMine) entry.mine = true;
    map.set(r.emoji, entry);
  });
  return Array.from(map.values());
};

export const hasReactions = message =>
  Array.isArray(message?.reactions) && message.reactions.some(r => r?.emoji);

const MessageReactions = ({ message, onRemoveMine }) => {
  const classes = useStyles();
  if (!hasReactions(message)) return null;

  const groups = groupReactions(message.reactions);

  return (
    <div
      className={`${classes.wrapper} ${message.fromMe ? classes.right : classes.left}`}
    >
      {groups.map(g => (
        <Tooltip
          key={g.emoji}
          title={
            <>
              {g.names.map(n => (
                <div key={n}>{n}</div>
              ))}
              {g.mine && <div style={{ opacity: 0.7, marginTop: 4 }}>Clique para remover a sua</div>}
            </>
          }
        >
          <span
            className={`${classes.pill} ${g.mine ? classes.mine : ""}`}
            onClick={g.mine && onRemoveMine ? () => onRemoveMine(message) : undefined}
          >
            {g.emoji}
            {g.names.length > 1 && (
              <span className={classes.count}>{g.names.length}</span>
            )}
          </span>
        </Tooltip>
      ))}
    </div>
  );
};

export default MessageReactions;
