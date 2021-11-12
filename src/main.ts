import { Telegraf, Context, Markup, session } from 'telegraf'
import { Message, User } from 'typegram'
import { ExtraReplyMessage } from 'telegraf/typings/telegram-types'
import axios from 'axios'
import * as fs from 'fs'
var fsPromises = require('fs').promises
const mime = require('mime-types')
const exec = require('child_process').exec;
var Url = require('url-parse')

//const MAX_FILE_SIZE = 50 << 20  // << 20 converts MB to bytes

const AUDIO_TYPES = [
  "mp3", "flac", "wav"
]
const AUDIO_CODEC = {
  "mp3": "libmp3lame",
  "flac": "flac",
  "wav": "pcm_s16le"
}

interface AudioContainer{
  url: URL,
  file_unique_id: string,
  mime_type: string,
  file_size: number,
  message_id: number
}

interface SessionData{
  lastMedia?: AudioContainer
  audioOutType?: string
  audioOutCompression?: number
}

interface MRContext extends Context {
  session?: SessionData

  /*getTelegramName(): string{
    return this.from.id + " (" + this.from.first_name + ")"
  }

  replyLog(text: string, extra?: ExtraReplyMessage): Promise<Message.TextMessage>{
    console.log("To %s: %s", "idk lol", text)
    return super.reply(text, extra)
  }*/
}


const token = process.env.BOT_TOKEN
if (token === undefined) {
  throw new Error('BOT_TOKEN must be provided!')
}



// Utility

function getTGName(user: User): string{
  return user.first_name + " (" + user.id + ")"
}

function downloadFile(url : URL, path : string){
  return axios({ url: url.href , responseType: 'stream'})
    .then( response => {
      return (response.data as any).pipe(fs.createWriteStream(`${process.env.MAIN_PATH}/temp-downloads/${path}`))
        //.on('finish', () => /* File is saved. */)
        //.on('error', e => /* An error has occured */)
    })
    .catch(error => {
      console.log("Could not save file: ", error)
    })
}


async function execShellCommand(cmd: String): Promise<String> {
return new Promise((resolve, reject) => {
  exec(cmd, (error: String, stdout: String, stderr: String) => {
    if (error) {
      reject(error);
    }
    resolve(stdout? stdout : stderr);
  });
});
}

async function ytdlGetLink(url: URL, message: Message.TextMessage): Promise<AudioContainer>{
  return execShellCommand(`youtube-dl -g "${url.toString()}"`)
    .then((ytdurl: String) => {
      var finalLine: String = ytdurl.split(/\r?\n/)[1]
      //console.log(finalLine)
      return {url: new Url(finalLine), message_id: message.message_id, file_unique_id: "test", mime_type: "video/mp4", file_size: -1}
    })
    .catch(error => {
      return Promise.reject()
    })
}

// Assumes ctx.session.lastMedia and audioOutType exist, and possibly audioOutCompression if the format needs it
async function convertFile(ctx: MRContext): Promise<any>{
  const outFile = process.env.MAIN_PATH + "/temp-downloads/" + ctx.session.lastMedia.file_unique_id + "." + ctx.session.audioOutType
  var ffOptions = ""

  if(ctx.session.audioOutType === "mp3"){
    ffOptions = `-q ${ctx.session.audioOutCompression}`
  }
  
  // Download and process
  return execShellCommand(`ffmpeg -i "${ctx.session.lastMedia.url}" -vn -c:a ${AUDIO_CODEC[ctx.session.audioOutType]} ${ffOptions} ${outFile}`)
    .then(() => { // Send back to the user
      return ctx.replyWithDocument({source: outFile}, {reply_to_message_id : ctx.session.lastMedia.message_id})
    })
    /*.then((uFile) => { // Save the sent message and continue the processing chain
      return ctx.telegram.getFileLink(uFile.document.file_id)
        .then((url) => {
          ctx.session.lastMedia = {url: url, }
        })
    })*/
    .then(() => { // Delete the file after
      return fsPromises.unlink(outFile)
    })
}


// Bot handles

const bot = new Telegraf<MRContext>(token)
bot.use(session())

bot.start((ctx) => ctx.reply('Hi! Forward a video to me, or paste a youtube link.'))

bot.on("message", async (ctx: MRContext, next) => {
  ctx.session ??= {} //Initialize session

  // Media
  if( "audio" in ctx.message ){
    let audio = (ctx.message as Message.AudioMessage).audio

    if(audio.mime_type == "audio/flac"){  //Weird telegram bug
      audio.mime_type = "audio/x-flac"
    }

    return ctx.telegram.getFileLink(audio.file_id)
      .then(url => {
        ctx.session.lastMedia = {url: url, file_unique_id: audio.file_unique_id, mime_type: audio.mime_type, file_size: audio.file_size, message_id: ctx.message.message_id}
        console.log("%s sent media: %s", getTGName(ctx.from), JSON.stringify(ctx.session.lastMedia))
        
        ctx.reply("What audio format to convert to?", Markup
          .keyboard(AUDIO_TYPES)
          .oneTime()
          .resize()
          )
      })
      .catch(error => {
        ctx.reply(error)
      })
  }
  else if( "video" in ctx.message ){
    let video = (ctx.message as Message.VideoMessage).video

    return ctx.telegram.getFileLink(video.file_id)
      .then(url => {
        ctx.session.lastMedia = {url: url, file_unique_id: video.file_unique_id, mime_type: video.mime_type, file_size: video.file_size, message_id: ctx.message.message_id}
        console.log("%s sent media: %s", getTGName(ctx.from), JSON.stringify(ctx.session.lastMedia))
        
        ctx.reply("What audio format to convert to?", Markup
          .keyboard(AUDIO_TYPES)
          .oneTime()
          .resize()
        )
      })
      .catch(error => {
        ctx.reply(error)
      })
  }
  else if( "document" in ctx.message ){
    let document = (ctx.message as Message.DocumentMessage).document

    if( document.mime_type.split("/")[0] != "video" && document.mime_type.split("/")[0] != "audio" ){
      return ctx.reply("Send audio or video to start.").then(ret => {return next()})
    }

    return ctx.telegram.getFileLink(document.file_id)
      .then(url => {
        ctx.session.lastMedia = {url: url, file_unique_id: document.file_unique_id, mime_type: document.mime_type, file_size: document.file_size, message_id: ctx.message.message_id}
        console.log("%s sent media: %s", getTGName(ctx.from), JSON.stringify(ctx.session.lastMedia))
        
        ctx.reply("What audio format to convert to?", Markup
          .keyboard(AUDIO_TYPES)
          .oneTime()
          .resize()
        )
      })
      .catch(error => {
        ctx.reply(error)
      })
  }
  else if("voice" in ctx.message){
    let voice = (ctx.message as Message.VoiceMessage).voice

    
    return ctx.telegram.getFileLink(voice.file_id)
      .then((url) => {
        ctx.session.lastMedia = {url: url, file_unique_id: voice.file_unique_id, mime_type: voice.mime_type, file_size: voice.file_size, message_id: ctx.message.message_id}
        console.log("%s sent media: %s", getTGName(ctx.from), JSON.stringify(ctx.session.lastMedia))
        
        ctx.reply("What audio format to convert to?", Markup
          .keyboard(AUDIO_TYPES)
          .oneTime()
          .resize()
        )
      })
      .catch(error => {
        ctx.reply(error)
      })
  }
  
  else if( "text" in ctx.message){
    let text = (ctx.message as Message.TextMessage).text

    // Check for a link to ytdl

    try{
      var url = new Url(text)
      if(url.protocol === "http:" || url.protocol === "https:"){
        console.log("%s sent link: %s", getTGName(ctx.from), text)

        return ytdlGetLink(url.toString(), ctx.message)
          .then((container) => {
            ctx.session.lastMedia = container
            return ctx.reply("What audio format to convert to?", Markup
              .keyboard(AUDIO_TYPES)
              .oneTime()
              .resize()
            )
          })
          .catch(error => {
            return ctx.reply("Failed to process link. Does it have media on it?")
          })
        
      }
    }
    catch(_) {}

    // Arguments for converting media
    console.log("%s: %s", getTGName(ctx.from), text)

    if( ctx.session.audioOutType ){
      // Try to get a bitrate number out of 'text'
      let compression: number = Number(text)

      if( isNaN(compression) ){
        return ctx.reply("Requires a number between 0 and 10.")
      }
      else{
        // Ready to convert
        ctx.session.audioOutCompression = compression
        console.log("%s is downloading a file of size %s ...", getTGName(ctx.from), ctx.session.lastMedia.file_size)

        return convertFile(ctx)
          .then(() => {
            // Reset the bot
            console.log("Finished converting.")
            ctx.session.lastMedia = undefined // Change this to the media just uploaded next
            ctx.session.audioOutType = undefined
          })
          .catch(error => {
            ctx.reply(error)
          })
        
      }
    }
    else if( ctx.session.lastMedia ){ //What to convert to?

      if(text === "done"){
        // Reset the bot
        ctx.session.lastMedia = undefined
        ctx.session.audioOutType = undefined

        return ctx.reply("OK. Send more media when you're ready to convert again.")
      }
      else if(text === "wav" || text == "flac"){
        ctx.session.audioOutType = text
        console.log("%s is downloading a file of size %s ...", getTGName(ctx.from), ctx.session.lastMedia.file_size)

        // Ready to convert
        return convertFile(ctx)
          .then(_ => {
            console.log("Finished converting.")

            // Reset the bot
            ctx.session.lastMedia = undefined // Change this to the media just uploaded next
            ctx.session.audioOutType = undefined
          })
          .catch(error => {
            ctx.reply(error)
          })
      }
      else if(text === "mp3"){
        //We still need a bitrate
        ctx.session.audioOutType = text
        return ctx.reply("Give the amount of compression to apply from 0 (best) to 10 (worst).")
      }
      else{
        return ctx.reply("Please pick one of the options: " + AUDIO_TYPES.join(", "), Markup
          .keyboard(AUDIO_TYPES)
          .oneTime()
          .resize()
        )
      }
    }

    // Unexpected text

    else{
      return ctx.reply("Start by sending audio or video.")
    }
    
  }

  // Not media, not text (images, stickers?)
  else{
    return ctx.reply("Couldn't understand the message.")
  }
  
} )

bot.launch()
  .then(fulfilled => {
    console.log("Bot running.")
  })
//bot.telegram.setWebhook("http://...")
//bot.startWebhook('/var/www/telegramwebhook', null, 25003)


// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))
