import openSocket from "socket.io-client";
import { getBackendUrl } from "../config";

function connectToSocket() {
    const token = localStorage.getItem("token");
    return openSocket(getBackendUrl(), {
      transports: ["websocket", "polling"],
      query: {
        token: JSON.parse(token),
      },
      // Reconnect aggressively so real-time stays alive after proxy timeouts
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      // Match server ping settings
      timeout: 60000,
    });
}

export default connectToSocket;
