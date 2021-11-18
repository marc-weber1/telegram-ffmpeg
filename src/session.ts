import { Context } from 'telegraf'
import { Message, User } from 'typegram'
import { ExtraReplyMessage } from 'telegraf/typings/telegram-types'

import { TGAudioMessage } from "./TGAudioMessage"
  
export interface SessionData{
    lastMedia?: TGAudioMessage
    audioOutType?: string
    audioOutCompression?: number
}
  
export class MRContext extends Context {
    session?: SessionData

    static getTGName(user: User): string{
        return user.first_name + " (" + user.id + ")"
    }

    getTelegramName(): string{
        return this.from.id + " (" + this.from.first_name + ")"
    }

    reply(text: string, extra?: ExtraReplyMessage): Promise<Message.TextMessage>{
        console.log("To %s: %s", "idk lol", text)
        return super.reply(text, extra)
    }
}