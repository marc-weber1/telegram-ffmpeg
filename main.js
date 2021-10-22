const { Telegraf, Markup } = require('telegraf')
const axios = require('axios')
const fs = require('fs')

const token = process.env.BOT_TOKEN
if (token === undefined) {
  throw new Error('BOT_TOKEN must be provided!')
}


const bot = new Telegraf(token)

bot.start((ctx) => ctx.reply('Hi! Forward a video to me, or paste a youtube link.'))
bot.on("message", (ctx, next) => {
    ctx.telegram.getFileLink(ctx.message.video.file_id)
      .then( url => {
        console.log(url.href)
        return axios({ url: url.href , responseType: 'stream'})
      })
      .then( response => {
        response.data.pipe(fs.createWriteStream(`/var/www/telegramwebhook/public/videos/${ctx.update.message.from.id}.mp4`))
      })
      .catch(error => {
        ctx.reply("Error: " + error)
      })
      .catch(error => { // ctx.reply failed
        console.log("Telegram context failure: ", error)
      })
    
} )

bot.launch()
//bot.telegram.setWebhook("http://...")
//bot.startWebhook('/var/www/telegramwebhook', null, 25003)


// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))
