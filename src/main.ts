import { Telegraf, Context, Markup, session } from 'telegraf'
import { Message } from 'typegram'
import axios from 'axios'
import * as fs from 'fs'
var fsPromises = require('fs').promises
const mime = require('mime-types')
const exec = require('child_process').exec;

//const MAX_FILE_SIZE = 50 << 20  // << 20 converts MB to bytes

const AUDIO_TYPES = [
  "mp3", "flac", "wav"
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
  audioOutCompression?: number
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
      return (response.data as any).pipe(fs.createWriteStream(`${process.env.MAIN_PATH}/temp-downloads/${path}`))
        //.on('finish', () => /* File is saved. */)
        //.on('error', e => /* An error has occured */)
    })
    .catch(error => {
      console.log("Could not save file: ", error)
    })
}


 function execShellCommand(cmd) {
  return new Promise((resolve, reject) => {
   exec(cmd, (error, stdout, stderr) => {
    if (error) {
     console.warn(error);
    }
    resolve(stdout? stdout : stderr);
   });
  });
 }

// Assumes ctx.session.lastMedia and audioOutType exist, and possibly audioOutCompression if the format needs it
async function convertFile(ctx: MRContext){ // TODO
  if(ctx.session.audioOutType === "mp3"){
    // Download and process
    return execShellCommand(`ffmpeg -i "${ctx.session.lastMedia.url}" -vn -c:a libmp3lame -q ${ctx.session.audioOutCompression} ${process.env.MAIN_PATH}/temp-downloads/${ctx.session.lastMedia.file_unique_id}.mp3`)
      .then(() => { // Send back to the user
        return ctx.replyWithAudio({source: `${process.env.MAIN_PATH}/temp-downloads/${ctx.session.lastMedia.file_unique_id}.mp3`})
      })
      .then(() => {  // Delete the file after
        return fsPromises.unlink(`${process.env.MAIN_PATH}/temp-downloads/${ctx.session.lastMedia.file_unique_id}.mp3`)
      })
  }
  else if(ctx.session.audioOutType === "wav"){
    // ...
  }
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
      // Try to get a bitrate number out of 'text'
      let compression: number = Number(text)

      if( isNaN(compression) ){
        ctx.reply("Requires a number between 0 and 10.")
      }
      else{
        // Ready to convert
        ctx.session.audioOutCompression = compression
        convertFile(ctx).then(_ => {
          // Reset the bot
          ctx.session.lastMedia = undefined // Change this to the media just uploaded next
          ctx.session.audioOutType = undefined
        })
        
      }
    }
    else if( ctx.session.lastMedia ){ //What to convert to?

      if(text === "done"){
        // Reset the bot
        ctx.session.lastMedia = undefined
        ctx.session.audioOutType = undefined

        ctx.reply("OK. Send more media when you're ready to convert again.")
      }
      else if(text === "wav" || text == "flac"){
        ctx.session.audioOutType = text
        // Ready to convert
        convertFile(ctx).then(_ => {
          // Reset the bot
          ctx.session.lastMedia = undefined // Change this to the media just uploaded next
          ctx.session.audioOutType = undefined
        })
      }
      else if(text === "mp3"){
        //We still need a bitrate
        ctx.session.audioOutType = text
        ctx.reply("Give the amount of compression to apply from 0 (best) to 10 (worst).")
      }
      else{
        ctx.reply("Please pick one of the options: " + AUDIO_TYPES.join(", "), Markup
          .keyboard(AUDIO_TYPES)
          .oneTime()
          .resize()
          )
      }
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
  .then(fulfilled => {
    console.log("Bot running.")
  })
//bot.telegram.setWebhook("http://...")
//bot.startWebhook('/var/www/telegramwebhook', null, 25003)


// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))
