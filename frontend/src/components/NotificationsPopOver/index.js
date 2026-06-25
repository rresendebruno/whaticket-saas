import React, { useState, useRef, useEffect, useContext } from "react";
import { useHistory } from "react-router-dom";
import { format } from "date-fns";
import openSocket from "../../services/socket-io";
import useSound from "use-sound";

import Popover from "@material-ui/core/Popover";
import IconButton from "@material-ui/core/IconButton";
import List from "@material-ui/core/List";
import ListItem from "@material-ui/core/ListItem";
import ListItemText from "@material-ui/core/ListItemText";
import ListItemSecondaryAction from "@material-ui/core/ListItemSecondaryAction";
import { makeStyles } from "@material-ui/core/styles";
import Badge from "@material-ui/core/Badge";
import Typography from "@material-ui/core/Typography";
import Button from "@material-ui/core/Button";
import Divider from "@material-ui/core/Divider";
import NotificationsIcon from "@material-ui/icons/Notifications";
import CloseIcon from "@material-ui/icons/Close";

import alertSound from "../../assets/sound.mp3";
import { AuthContext } from "../../context/Auth/AuthContext";

const useStyles = makeStyles(theme => ({
	popoverPaper: {
		width: "100%",
		maxWidth: 370,
		marginLeft: theme.spacing(2),
		marginRight: theme.spacing(1),
		[theme.breakpoints.down("sm")]: {
			maxWidth: 270,
		},
	},
	tabContainer: {
		overflowY: "auto",
		maxHeight: 380,
		...theme.scrollbarStyles,
	},
	iconButton: {
		color: theme.palette.text.primary,
	},
	header: {
		display: "flex",
		alignItems: "center",
		justifyContent: "space-between",
		padding: "8px 16px",
	},
	mentionItem: {
		cursor: "pointer",
		"&:hover": {
			backgroundColor: theme.palette.action.hover,
		},
	},
	mentionGroup: {
		fontWeight: 600,
		color: theme.palette.primary.main,
	},
	mentionBody: {
		whiteSpace: "nowrap",
		overflow: "hidden",
		textOverflow: "ellipsis",
		maxWidth: 260,
		fontSize: "0.85rem",
		color: theme.palette.text.secondary,
	},
	mentionTime: {
		fontSize: "0.75rem",
		color: theme.palette.text.disabled,
	},
	emptyText: {
		padding: "24px 16px",
		textAlign: "center",
		color: theme.palette.text.secondary,
	},
}));

const NotificationsPopOver = () => {
	const classes = useStyles();
	const history = useHistory();
	const { user } = useContext(AuthContext);
	const anchorEl = useRef();
	const [isOpen, setIsOpen] = useState(false);
	const [mentions, setMentions] = useState([]);
	const [play] = useSound(alertSound);
	const soundAlertRef = useRef();
	const historyRef = useRef(history);

	useEffect(() => {
		soundAlertRef.current = play;
		if (!("Notification" in window)) return;
		Notification.requestPermission();
	}, [play]);

	useEffect(() => {
		historyRef.current = history;
	}, [history]);

	useEffect(() => {
		const socket = openSocket();

		socket.on("connect", () => socket.emit("joinNotification"));

		socket.on("groupMention", data => {
			const mention = {
				id: `${data.ticketId}-${Date.now()}`,
				ticketId: data.ticketId,
				groupName: data.groupName,
				senderName: data.senderName,
				body: data.body,
				time: new Date(),
			};

			setMentions(prev => [mention, ...prev]);
			soundAlertRef.current();

			// Desktop notification
			if ("Notification" in window && Notification.permission === "granted") {
				const n = new Notification(
					`📢 Menção em ${data.groupName}`,
					{
						body: `${data.senderName}: ${data.body}`,
						tag: `mention-${data.ticketId}`,
						renotify: true,
					}
				);
				n.onclick = e => {
					e.preventDefault();
					window.focus();
					historyRef.current.push(`/tickets/${data.ticketId}`);
				};
			}
		});

		return () => {
			socket.disconnect();
		};
	}, [user]);

	const handleGoToTicket = ticketId => {
		setIsOpen(false);
		history.push(`/tickets/${ticketId}`);
	};

	const handleDismiss = (e, mentionId) => {
		e.stopPropagation();
		setMentions(prev => prev.filter(m => m.id !== mentionId));
	};

	const handleClearAll = () => {
		setMentions([]);
	};

	return (
		<>
			<IconButton
				onClick={() => setIsOpen(prev => !prev)}
				ref={anchorEl}
				aria-label="Menções"
				className={classes.iconButton}
			>
				<Badge badgeContent={mentions.length} color="secondary">
					<NotificationsIcon />
				</Badge>
			</IconButton>
			<Popover
				disableScrollLock
				open={isOpen}
				anchorEl={anchorEl.current}
				anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
				transformOrigin={{ vertical: "top", horizontal: "right" }}
				classes={{ paper: classes.popoverPaper }}
				onClose={() => setIsOpen(false)}
			>
				<div className={classes.header}>
					<Typography variant="subtitle1" style={{ fontWeight: 600 }}>
						📢 Menções em grupos
					</Typography>
					{mentions.length > 0 && (
						<Button size="small" onClick={handleClearAll} color="default">
							Limpar
						</Button>
					)}
				</div>
				<Divider />
				<List dense className={classes.tabContainer}>
					{mentions.length === 0 ? (
						<Typography className={classes.emptyText}>
							Nenhuma menção recente
						</Typography>
					) : (
						mentions.map(mention => (
							<ListItem
								key={mention.id}
								className={classes.mentionItem}
								onClick={() => handleGoToTicket(mention.ticketId)}
							>
								<ListItemText
									primary={
										<span>
											<span className={classes.mentionGroup}>
												{mention.groupName}
											</span>
											{" · "}
											<span className={classes.mentionTime}>
												{format(mention.time, "HH:mm")}
											</span>
										</span>
									}
									secondary={
										<span className={classes.mentionBody}>
											<strong>{mention.senderName}:</strong> {mention.body}
										</span>
									}
								/>
								<ListItemSecondaryAction>
									<IconButton
										size="small"
										onClick={e => handleDismiss(e, mention.id)}
									>
										<CloseIcon fontSize="small" />
									</IconButton>
								</ListItemSecondaryAction>
							</ListItem>
						))
					)}
				</List>
			</Popover>
		</>
	);
};

export default NotificationsPopOver;
