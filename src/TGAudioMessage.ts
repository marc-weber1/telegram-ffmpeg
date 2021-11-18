import { Message } from 'typegram'
var fsPromises = require('fs').promises
const mime = require('mime-types')
const exec = require('child_process').exec;
import axios from 'axios'
var Url = require('url-parse')
import * as fs from 'fs'
import * as TG from 'typegram'

import { MRContext } from "./session"

const AUDIO_TYPES = [
  "mp3", "flac", "wav"
]
const AUDIO_CODEC = {
  "mp3": "libmp3lame",
  "flac": "flac",
  "wav": "pcm_s16le",
  "original quality": "copy"
}

type AudioContainer = TG.Audio | TG.Video | TG.Document | TG.Voice

export class TGAudioMessage{

  constructor(
    public url: URL,
    public message_id: number,
    public is_video: boolean,
    public container?: AudioContainer
  ) {}

  // Assumes ctx.session.lastMedia and audioOutType exist, and possibly audioOutCompression if the format needs it
  async convertFile(ctx: MRContext): Promise<any> {
    var fileExt = ctx.session.audioOutType
    if (ctx.session.audioOutType === "original quality") {
      fileExt = mime.extension(this.container.mime_type)
    }
    const outFile = process.env.MAIN_PATH + "/temp-downloads/" + this.container.file_unique_id + "." + fileExt

    var ffOptions = ""
    if (ctx.session.audioOutType === "mp3") {
      ffOptions = `-q ${ctx.session.audioOutCompression}`
    }

    // Download and process
    return TGAudioMessage.execShellCommand(`ffmpeg -i "${ctx.session.lastMedia.url}" -vn -c:a ${AUDIO_CODEC[ctx.session.audioOutType]} ${ffOptions} ${outFile}`)
      .then(() => { // Send back to the user
        return ctx.replyWithDocument({ source: outFile }, { reply_to_message_id: ctx.session.lastMedia.message_id })
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

  // Gets a file container from a link using youtube-dl
  static async ytdlGetContainer(url: URL, message: Message.TextMessage): Promise<TGAudioMessage> {
    return TGAudioMessage.execShellCommand(`youtube-dl -g "${url.toString()}"`)
      .then((ytdurl: String) => {
        var outLines: String[] = ytdurl.split(/\r?\n/).filter(word => word !== "")
        console.log(outLines[outLines.length - 1])
        return new TGAudioMessage(new Url(outLines[outLines.length - 1]), message.message_id, true)
      })
      .catch(error => {
        return Promise.reject()
      })
  }

  // Gets a file container from a telegram message (if it has audio/video)
  static async getContainer(ctx: MRContext): Promise<TGAudioMessage>{
    
    var container: AudioContainer, is_video: boolean

    if( "audio" in ctx.message ){
      container = ctx.message.audio
    }
    else if( "video" in ctx.message ){
      container = ctx.message.video
    }
    else if( "document" in ctx.message ){
      if( ctx.message.document.mime_type.split("/")[0] === "video"){

      }
      else if( ctx.message.document.mime_type.split("/")[0] != "video" && ctx.message.document.mime_type.split("/")[0] != "audio" ){
        throw "Could not create audio container: document has no audio"
      }

      container = ctx.message.document
    }
    else if( "voice" in ctx.message ){
      container = ctx.message.voice
    }
    else if( "text" in ctx.message ){
      // Check for urls?
    }
    else{
      throw 'Could not create audio container: no media in message'
    }

    if(container.mime_type == "audio/flac"){  //Weird telegram bug
      container.mime_type = "audio/x-flac"
    }

    return ctx.telegram.getFileLink(container.file_id)
      .then((url) => {
        return new TGAudioMessage(url, ctx.message.message_id, is_video, container)
      })

  }

  getKeyboardOptions(): string[]{
    if( this.is_video ){
      return AUDIO_TYPES
    }
    else{
      return ["original quality"].concat(AUDIO_TYPES)
    }
  }


  // PRIVATE

  private static async execShellCommand(cmd: String): Promise<String> {
    return new Promise((resolve, reject) => {
      exec(cmd, (error: String, stdout: String, stderr: String) => {
        if (error) {
          reject(error);
        }
        resolve(stdout ? stdout : stderr);
      });
    });
  }

  private async downloadFile(path: string) {
    return axios({ url: this.url.href, responseType: 'stream' })
      .then(response => {
        return (response.data as any).pipe(fs.createWriteStream(`${process.env.MAIN_PATH}/temp-downloads/${path}`))
        //.on('finish', () => /* File is saved. */)
        //.on('error', e => /* An error has occured */)
      })
      .catch(error => {
        console.log("Could not save file: ", error)
      })
  }
}

