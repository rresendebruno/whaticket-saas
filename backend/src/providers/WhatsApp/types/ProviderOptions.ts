export interface SendMessageOptions {
  quotedMessageId?: string;
  quotedMessageFromMe?: boolean;
  linkPreview?: boolean;
  mentioned?: string[];
  mentionAll?: boolean;
}

export interface SendMediaOptions {
  caption?: string;
  sendAudioAsVoice?: boolean;
  sendMediaAsDocument?: boolean;
  quotedMessageId?: string;
}
