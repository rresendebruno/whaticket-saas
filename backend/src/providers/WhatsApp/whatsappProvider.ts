import Whatsapp from "../../models/Whatsapp";
import {
  ProviderMessage,
  ProviderMediaInput,
  ProviderContact,
  SendMessageOptions,
  SendMediaOptions
} from "./types";
import { WhatsappWebJsProvider } from "./Implementations/wwebjs";
import { WhaileysProvider } from "./Implementations/whaileys";
import { ZApiProvider } from "./Implementations/zapi";

export interface WhatsappProvider {
  init(whatsapp: Whatsapp): Promise<void>;
  removeSession(whatsappId: number): void;
  logout(sessionId: number): Promise<void>;
  sendMessage(
    sessionId: number,
    to: string,
    body: string,
    options?: SendMessageOptions
  ): Promise<ProviderMessage>;
  sendMedia(
    sessionId: number,
    to: string,
    media: ProviderMediaInput,
    options?: SendMediaOptions
  ): Promise<ProviderMessage>;
  deleteMessage(
    sessionId: number,
    chatId: string,
    messageId: string,
    fromMe: boolean
  ): Promise<void>;
  checkNumber(sessionId: number, number: string): Promise<string>;
  getProfilePicUrl(sessionId: number, number: string): Promise<string>;
  getContacts(sessionId: number): Promise<ProviderContact[]>;
  // Optional: only providers that can list groups implement it (Z-API)
  getGroups?(sessionId: number): Promise<ProviderContact[]>;
  // Optional: emoji reactions (Z-API)
  sendReaction?(
    sessionId: number,
    chatId: string,
    messageId: string,
    emoji: string
  ): Promise<void>;
  removeReaction?(
    sessionId: number,
    chatId: string,
    messageId: string
  ): Promise<void>;
  // Optional: WhatsApp privacy settings (Z-API)
  setPrivacy?(
    sessionId: number,
    setting: "photo" | "lastSeen" | "description" | "online" | "readReceipts",
    value: string
  ): Promise<void>;
  // Optional: group subject/description/participants (Z-API)
  getGroupMetadata?(
    sessionId: number,
    groupId: string
  ): Promise<{
    subject?: string;
    description?: string;
    owner?: string;
    participants: {
      phone: string;
      isAdmin: boolean;
      isSuperAdmin: boolean;
      name?: string;
    }[];
  }>;
  // Optional: share a contact card (Z-API)
  sendContact?(
    sessionId: number,
    to: string,
    contactName: string,
    contactPhone: string,
    quotedMessageId?: string
  ): Promise<ProviderMessage>;
  sendSeen(sessionId: number, chatId: string, messageId?: string): Promise<void>;
  fetchChatMessages(
    sessionId: number,
    chatId: string,
    limit: number
  ): Promise<ProviderMessage[]>;
}

const provider = process.env.WHATSAPP_PROVIDER || "wwebjs";

const providersMap: Record<string, WhatsappProvider> = {
  wwebjs: WhatsappWebJsProvider,
  whaileys: WhaileysProvider,
  zapi: ZApiProvider
};

const whatsappProvider = providersMap[provider];

export { whatsappProvider };
