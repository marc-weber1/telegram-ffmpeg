import { Context, Telegraf, session } from 'telegraf'
import { Message } from 'typegram'
import axios from 'axios'
import * as fs from 'fs'
//import mime from 'mime-types'

//const MAX_FILE_SIZE = 50 << 20  // << 20 converts MB to bytes

interface SessionData{
  lastURL?: URL
  inMimeType?: string
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
  ctx.session ??= { lastURL: undefined }

  if( "audio" in ctx.message ){
    let audio = (ctx.message as Message.AudioMessage).audio

    if(audio.mime_type == "audio/flac"){  //Weird telegram bug
      audio.mime_type = "audio/x-flac"
    }

    ctx.telegram.getFileLink(audio.file_id)
      .then(url => {
        ctx.session.lastURL = url
        ctx.reply(JSON.stringify(audio))
        //return downloadFile(url, `audio/${ctx.message.audio.file_id}.${mime.extension(ctx.message.audio.mime_type)}`)
      })
      .catch(error => {
        ctx.reply(error)
      })
  }
  else if( "video" in ctx.message ){
    let video = (ctx.message as Message.VideoMessage).video

    ctx.telegram.getFileLink(video.file_id)
      .then(url => {
        ctx.session.lastURL = url
        ctx.reply(JSON.stringify(video))
        //return downloadFile(url, `videos/${ctx.message.video.file_id}.${mime.extension(ctx.message.video.mime_type)}`)
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
        ctx.session.lastURL = url
        ctx.reply(JSON.stringify(document))
        // return downloadFile(url, `documents/${ctx.message.document.file_id}.${mime.extension(ctx.message.document.mime_type)}`)
      })
      .catch(error => {
        ctx.reply(error)
      })
  }
  else{
    ctx.reply( ctx.session.lastURL.toString() )
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
