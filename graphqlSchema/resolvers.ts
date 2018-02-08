import * as fs from 'fs'
import promisesAll from 'promises-all'
import * as mkdirp from 'mkdirp'
import shortid from 'shortid'
import * as lowdb from 'lowdb'
import * as FileSync from 'lowdb/adapters/FileSync'
import { GraphQLUpload } from 'apollo-upload-server'

const uploadDir = './uploads'
const db = lowdb(new FileSync('db.json'))

// Seed an empty DB
db.defaults({ uploads: [] }).write()

// Ensure upload directory exists
mkdirp.sync(uploadDir)

const storeFS: any = ({ stream, filename }) => {
  const id2 = shortid.generate()
  const path = `${uploadDir}/${id2}-${filename}`
  return new Promise((resolve, reject) =>
    stream
      .on('error', error => {
        if (stream.truncated)
          // Delete the truncated file
          fs.unlinkSync(path)
        reject(error)
      })
      .on('end', () => resolve({ id2, path }))
      .pipe(fs.createWriteStream(path))
  )
}

const storeDB = file =>
  db
    .get('uploads')
    .push(file)
    .last()
    .write()

const processUpload = async upload => {
  const { stream, filename, mimetype, encoding } = await upload
  const { fileId, path } = await storeFS({ stream, filename })
  return storeDB({ fileId, filename, mimetype, encoding, path })
}

export default {
  Upload: GraphQLUpload,
  Query: {
    uploads: () => db.get('uploads').value()
  },
  Mutation: {
    singleUpload: (obj, { file }) => {
      console.log(obj)
      return processUpload(file)
    },
    multipleUpload: async (obj, { files }) => {
      const { resolve, reject } = await promisesAll.all(
        files.map(processUpload)
      )

      if (reject.length)
        reject.forEach(({ name, message }) =>
          // eslint-disable-next-line no-console
          console.error(`${name}: ${message}`)
        )

      return resolve
    }
  }
}
