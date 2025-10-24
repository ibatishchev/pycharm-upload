import { google } from 'googleapis'
import axios from 'axios'

async function main() {
  const apiUrl =
    'https://data.services.jetbrains.com/products/releases?code=PCP&latest=true&type=release'
  const platforms = {
    windows: {
      key: 'windows',
      ext: '.exe',
      mime: 'application/vnd.microsoft.portable-executable',
    },
    mac: { key: 'mac', ext: '.dmg', mime: 'application/x-apple-diskimage' },
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GDRIVE_CLIENT_ID,
    process.env.GDRIVE_CLIENT_SECRET,
    'urn:ietf:wg:oauth:2.0:oob'
  )

  oauth2Client.setCredentials({
    refresh_token: process.env.GDRIVE_REFRESH_TOKEN,
  })

  const drive = google.drive({ version: 'v3', auth: oauth2Client })

  const versionInfo = await axios.get(apiUrl)
  const latest = versionInfo.data['PCP'][0]
  const version = latest.version

  const folderId = '1NoLMKCNle-daq0stTxYKuEi8J_YsPhhE' // ID папки в общем диске
  const sharedDriveId = '0AM7kZkCzbi7xUk9PVA' //  ID общего диска 

  for (const [platform, { key, ext, mime }] of Object.entries(platforms)) {
    const info = latest.downloads[key]
    if (!info || !info.link) continue

    const url = info.link

    const now = new Date()
    const date = now.toISOString().split('T')[0]
    const time = now.toTimeString().slice(0, 8).replace(/:/g, '-')
    const filename = `pycharm-professional-${version}-${platform}-${date}_${time}${ext}`

    const response = await axios({ method: 'GET', url, responseType: 'stream' })

    try {
      const uploaded = await drive.files.create({
        requestBody: {
          name: filename,
          parents: [folderId],
        },
        media: { mimeType: mime, body: response.data },
        supportsAllDrives: true,
      })

      console.log(`✅ Загружено: ${filename}`)

      // Удаление старых версий
      const { data } = await drive.files.list({
        q: `'${folderId}' in parents and name contains 'pycharm-professional-' and name contains '${platform}' and name != '${filename}' and trashed = false`,
        fields: 'files(id, name)',
        pageSize: 10,
        driveId: sharedDriveId,
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
        corpora: 'drive',
      })

      const oldFiles = data.files || []
      for (const file of oldFiles) {
        await drive.files.delete({
          fileId: file.id,
          supportsAllDrives: true,
        })
        console.log(`🗑️ Удалено: ${file.name}`)
      }
    } catch (err) {
      console.error(`❌ Ошибка загрузки ${filename}: ${err.message}`)
    }
  }
}

main().catch((err) => {
  console.error(`❌ Ошибка: ${err.message}`)
  process.exit(1)
})
