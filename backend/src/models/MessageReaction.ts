import {
  Table,
  Column,
  DataType,
  CreatedAt,
  UpdatedAt,
  Model,
  PrimaryKey,
  AutoIncrement,
  ForeignKey,
  BelongsTo,
  Default
} from "sequelize-typescript";
import Message from "./Message";
import User from "./User";

@Table
class MessageReaction extends Model<MessageReaction> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @ForeignKey(() => Message)
  @Column(DataType.STRING)
  messageId: string;

  @BelongsTo(() => Message)
  message: Message;

  @Column(DataType.STRING(32))
  emoji: string;

  @Default(false)
  @Column
  fromMe: boolean;

  @Column
  senderNumber: string;

  @Column
  senderName: string;

  @ForeignKey(() => User)
  @Column
  userId: number;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default MessageReaction;
