import { Telegraf, Context, Markup, session } from 'telegraf'
import { Message } from 'typegram'
import axios from 'axios'
import * as fs from 'fs'
var mime = require('mime-types')

//const MAX_FILE_SIZE = 50 << 20  // << 20 converts MB to bytes

const AUDIO_TYPES = [
  "mp3", "vorbis", "opus", "flac", "wav"
]

interface AudioContainer{
  url: URL,
  file_unique_id: string,
  mime_type: string,
  file_size: number
}

interface SessionData{
  lastMedia?: AudioContainer
  audioOutType?: string
}

interface MRContext extends Context {
  session?: SessionData
}

const token = process.env.BOT_TOKEN
if (token === undefined) {
  throw new Error('BOT_TOKEN must be provided!')
}



// Utility

function downloadFile(url : URL, path : string){
  return axios({ url: url.href , responseType: 'stream'})
    .then( response => {
      return (response.data as any).pipe(fs.createWriteStream(`/var/www/telegramwebhook/temp-downloads/${path}`))
        //.on('finish', () => /* File is saved. */)
        //.on('error', e => /* An error has occured */)
    })
    .catch(error => {
      console.log("Could not save file: ", error)
    })
}


// Bot handles

const bot = new Telegraf<MRContext>(token)
bot.use(session())

bot.start((ctx) => ctx.reply('Hi! Forward a video to me, or paste a youtube link.'))

bot.on("message", (ctx: MRContext, next) => {
  ctx.session ??= {} //Initialize session

  // Media
  if( "audio" in ctx.message ){
    let audio = (ctx.message as Message.AudioMessage).audio

    if(audio.mime_type == "audio/flac"){  //Weird telegram bug
      audio.mime_type = "audio/x-flac"
    }

    ctx.telegram.getFileLink(audio.file_id)
      .then(url => {
        ctx.session.lastMedia = {url: url, file_unique_id: audio.file_unique_id, mime_type: audio.mime_type, file_size: audio.file_size}
        ctx.reply("What audio format to convert to?", Markup
          .keyboard(['mp3','ogg','opus','flac','wav'])
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

    ctx.telegram.getFileLink(video.file_id)
      .then(url => {
        ctx.session.lastMedia = {url: url, file_unique_id: video.file_unique_id, mime_type: video.mime_type, file_size: video.file_size}
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
      ctx.reply("Send audio or video to start.").then(ret => {return next()})
    }

    ctx.telegram.getFileLink(document.file_id)
      .then(url => {
        ctx.session.lastMedia = {url: url, file_unique_id: document.file_unique_id, mime_type: document.mime_type, file_size: document.file_size}
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

  // Arguments for converting media
  else if( "text" in ctx.message){
    let text = (ctx.message as Message.TextMessage).text

    if( ctx.session.audioOutType ){

    }
    else if( ctx.session.lastMedia ){ //What to convert to?

      if(text === "done"){
        ctx.reply("OK. Send more media when you're ready to convert again.")
        
        // Reset the bot
        ctx.session.lastMedia = undefined
        ctx.session.audioOutType = undefined
      }
      else if(text === "wav" || text == "flac"){
        //Ready to convert
        ctx.reply("Command: convert " + ctx.session.lastMedia.url.toString() + " to " + text )

        // Reset the bot
        ctx.session.lastMedia = undefined // Change this to the media just uploaded next
        ctx.session.audioOutType = undefined
      }
      else if(text === "mp3" || text === "vorbis" || text === "opus"){
        //We still need a bitrate
        ctx.reply("Command: convert " + ctx.session.lastMedia.url.toString() + " to " + text )
      }
      else{
        ctx.reply("Please pick one of the options: " + AUDIO_TYPES.join(", "), Markup
          .keyboard(AUDIO_TYPES)
          .oneTime()
          .resize()
          )
      }

      //return downloadFile(url, `videos/${ctx.message.video.file_id}.${mime.extension(ctx.message.video.mime_type)}`)
    }
    else{
      ctx.reply("Start by sending audio or video.")
    }
    
  }

  // Not media, not text (images, stickers?)
  else{
    ctx.reply("Couldn't understand the message.")
  }
  
} )

bot.launch()
  .then(fulfilled =>{
    console.log("Bot running.")
  })
//bot.telegram.setWebhook("http://...")
//bot.startWebhook('/var/www/telegramwebhook', null, 25003)


// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))
