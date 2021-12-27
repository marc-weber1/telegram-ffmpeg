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

type URLAudioData = {
  file_unique_id: string,
  mime_type: string,
  file_size: number
}

type AudioContainer = TG.Audio | TG.Video | TG.Document | TG.Voice

export class TGAudioMessage{

  constructor(
    public url: URL,
    public message_id: number,
    public container: AudioContainer | URLAudioData
  ) {}

  // Assumes ctx.session.lastMedia and audioOutType exist, and possibly audioOutCompression if the format needs it
  async convertFile(ctx: MRContext): Promise<any> {
    var fileExt = ctx.session.audioOutType
    var ffOptions = ""
    if ( ctx.session.audioOutType === "original quality" ) {
      fileExt = mime.extension(this.container.mime_type)

      if( fileExt === "mpga" ){ // For some reason it thinks this is the extension for mpeg
        fileExt = "mp3"
      }
      else if( fileExt === "weba" ){ // Ok seriously who uses weba
        fileExt = "ogg"
      }
    }
    else if( ctx.session.audioOutType === "mp3") {
      ffOptions = `-q ${ctx.session.audioOutCompression}`
    }
    const outFile = process.env.MAIN_PATH + "/temp-downloads/" + this.getFileName() + "." + fileExt

    // Download and process
    return TGAudioMessage.execShellCommand(`ffmpeg -i "${this.url}" -vn -c:a ${AUDIO_CODEC[ctx.session.audioOutType]} ${ffOptions} ${outFile}`)
      .then(() => { // Send back to the user
        return ctx.replyWithDocument({ source: outFile }, { reply_to_message_id: this.message_id })
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
    
    return TGAudioMessage.execShellCommand(`yt-dlp -g "${url.toString()}"`)
      .then((ytdout: string) => {
        var outLines: string[] = ytdout.split(/\r?\n/).filter(word => word !== "")
        var ytdurl = outLines[outLines.length - 1] // Always take the last one I guess
        console.log(ytdurl)

        return axios.head(ytdurl) // request just the headers, no file download
          .then((response) => {
            const mime_type: string = response.headers["content-type"]
            const file_size: number = parseInt(response.headers["content-length"])
	    
	    mime_type.split("/")[1] //Make sure this doesn't error

            const container: URLAudioData = { file_unique_id: "test", mime_type, file_size }
            console.log(container)

            return new TGAudioMessage(new Url(ytdurl), message.message_id, container)
          })
	  .catch( error => {
	    console.log("Error occurred getting website headers: " + error)
	    const container: URLAudioData = { file_unique_id: "file", mime_type: "audio/wav", file_size: -1 }
	    return new TGAudioMessage(new Url(ytdurl), message.message_id, container)
	  })
      })
      .catch(error => {
        return Promise.reject()
      })
  }

  // Gets a file container from a telegram message (if it has audio/video)
  static async getContainer(ctx: MRContext): Promise<TGAudioMessage>{
    
    var container: AudioContainer

    if( "audio" in ctx.message ){
      container = ctx.message.audio
    }
    else if( "video" in ctx.message ){
      container = ctx.message.video
    }
    else if( "document" in ctx.message ){
      const media_type = ctx.message.document.mime_type.split("/")[0]
      if( media_type !== "video" && media_type !== "audio" ){
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
        return new TGAudioMessage(url, ctx.message.message_id, container)
      })

  }

  getKeyboardOptions(): string[]{
    return ["original quality"].concat(AUDIO_TYPES)
  }

  toString(): string{
    return JSON.stringify(this)
  }

  getFileSize(): number{
    if(this.container){
      return this.container.file_size
    }

    return -1
  }

  getFileName(): string{
    return this.container.file_unique_id
  }

  isVideo(): boolean{
    return this.container.mime_type.split("/")[0] === "video"
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

