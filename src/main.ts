import { Telegraf, Context, Markup, session } from 'telegraf'
import { Message, User } from 'typegram'
var Url = require('url-parse')

import { MRContext } from "./session"
import { TGAudioMessage as AM } from "./TGAudioMessage"

//const MAX_FILE_SIZE = 50 << 20  // << 20 converts MB to bytes


const token = process.env.BOT_TOKEN
if (token === undefined) {
  throw new Error('BOT_TOKEN must be provided!')
}

// Bot handles

const bot = new Telegraf<MRContext>(token)
bot.use(session())

bot.start((ctx) => ctx.reply('Hi! Forward a video to me, or paste a youtube link.'))

bot.command("reset", async (ctx: MRContext, next) => {
  console.log("%s reset their session.", MRContext.getTGName(ctx.from))
  ctx.session = {}
  return ctx.reply("Reset session.")
})

bot.on("message", async (ctx: MRContext, next) => {
  ctx.session ??= {} //Initialize session

  // Media
  if ( "audio" in ctx.message || "video" in ctx.message || "document" in ctx.message || "voice" in ctx.message ){
    
    return AM.getContainer(ctx)
      .then(async (container: AM) => {
        console.log("%s sent media %s of size %d",)

        return ctx.reply("What audio format to convert to?", Markup
            .keyboard(ctx.session.lastMedia.getKeyboardOptions())
            .oneTime()
            .resize()
          )
      })
      .catch( error => {
        ctx.reply(error)
      })
  }
  
  // URL or argument
  else if( "text" in ctx.message){
    let text = (ctx.message as Message.TextMessage).text

    // Check for a link to ytdl

    try{
      var url = new Url(text)
      if(url.protocol === "http:" || url.protocol === "https:"){
        console.log("%s sent link: %s", MRContext.getTGName(ctx.from), text)

        return AM.ytdlGetContainer(url.toString(), ctx.message)
          .then((container) => {
            ctx.session.lastMedia = container
            return ctx.reply("What audio format to convert to?", Markup
              .keyboard(ctx.session.lastMedia.getKeyboardOptions())
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
    console.log("%s: %s", MRContext.getTGName(ctx.from), text)

    if( ctx.session.audioOutType ){
      // Try to get a bitrate number out of 'text'
      let compression: number = Number(text)

      if( isNaN(compression) ){
        return ctx.reply("Requires a number between 0 and 10.")
      }
      else{
        // Ready to convert
        ctx.session.audioOutCompression = compression
        console.log("%s is downloading a file of size %s ...", MRContext.getTGName(ctx.from), ctx.session.lastMedia.container.file_size)

        return ctx.session.lastMedia.convertFile(ctx)
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
      else if(text === "wav" || text === "flac" || text === "original quality"){
        console.log("%s is downloading a file of size %s ...", MRContext.getTGName(ctx.from), ctx.session.lastMedia.container.file_size)
        ctx.session.audioOutType = text

        // Ready to convert
        return ctx.session.lastMedia.convertFile(ctx)
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
        return ctx.reply("Please pick one of the options: " + ctx.session.lastMedia.getKeyboardOptions().join(", "), Markup
          .keyboard( ctx.session.lastMedia.getKeyboardOptions() )
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
