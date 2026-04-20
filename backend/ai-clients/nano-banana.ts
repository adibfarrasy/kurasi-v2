import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { GoogleGenAI } from '@google/genai'
import { env } from '../env'

const ai = new GoogleGenAI({
  apiKey: env.GEMINI_API_KEY,
})

const model = 'gemini-3.1-flash-image-preview'

const prompt = `Create try-on picture of a person.
- Person from image 1
- Before try-on, make sure you replace the white tshirt the person is wearing
- Wear shirt from image 2
- Wear pants from image 3
- Wear beanie from image 4.
- Always keep the shirt untucked
- The person is posing in a relaxed manner, body faces forward, face faces very slightly left, neutral face expression.
- Background is dominant color of the outfits put together.
- Background should be HSL with Saturation always 55% and Lightness always 78%.
- Just adjust the hue to make it the dominant color of the outfits put together.`

const imageInputs = [
  {
    mimeType: 'image/jpeg',
    path: new URL('../people/mustache.jpg', import.meta.url),
  },
  {
    mimeType: 'image/png',
    path: new URL('../collared shirt/collared-shirt-1.png', import.meta.url),
  },
  {
    mimeType: 'image/png',
    path: new URL('../pants/pants-9.png', import.meta.url),
  },
  {
    mimeType: 'image/png',
    path: new URL('../headwear/headwear-1.png', import.meta.url),
  },
] as const

async function uploadImage(image: (typeof imageInputs)[number]) {
  const localPath = fileURLToPath(image.path)
  const uploadStartedAt = Date.now()
  const file = await ai.files.upload({
    file: localPath,
    config: {
      mimeType: image.mimeType,
    },
  })

  if (!file.uri) {
    throw new Error(`Uploaded file is missing uri: ${localPath}`)
  }

  return {
    file,
    fileUri: file.uri,
    mimeType: file.mimeType ?? image.mimeType,
    localPath,
    uploadDurationMs: Date.now() - uploadStartedAt,
  }
}

async function putOutfitsOnPerson() {
  const startedAt = Date.now()
  const uploadStartedAt = Date.now()
  const uploadedImages = await Promise.all(imageInputs.map(uploadImage))
  const totalUploadDurationMs = Date.now() - uploadStartedAt

  const contents = [
    { text: prompt },
    ...uploadedImages.map(({ fileUri, mimeType }) => ({
      fileData: {
        fileUri,
        mimeType,
      },
    })),
  ]

  const apiCallStartedAt = Date.now()
  const response = await ai.models.generateContent({
    model,
    contents,
    config: {
      imageConfig: {
        aspectRatio: '2:3',
      },
    },
  })
  const apiCallDurationMs = Date.now() - apiCallStartedAt

  const parts = response.candidates?.[0]?.content?.parts ?? []
  if (parts.length === 0) {
    throw new Error('Gemini returned no content parts')
  }

  const outputDir = new URL('../outputs/', import.meta.url)
  mkdirSync(fileURLToPath(outputDir), { recursive: true })

  const outputPaths: string[] = []

  for (const [index, part] of parts.entries()) {
    if (part.text) {
      console.log(part.text)
    }

    if (!part.inlineData?.data) {
      continue
    }

    const extension = part.inlineData.mimeType === 'image/jpeg' ? 'jpg' : 'png'
    const outputPath = new URL(
      `../outputs/gemini-${Date.now()}-${index + 1}.${extension}`,
      import.meta.url,
    )

    await Bun.write(outputPath, Buffer.from(part.inlineData.data, 'base64'))
    outputPaths.push(fileURLToPath(outputPath))
  }

  if (outputPaths.length === 0) {
    throw new Error('Gemini returned no image data')
  }

  console.log({
    model,
    uploadedImages: uploadedImages.map(({ file, fileUri, localPath, uploadDurationMs }) => ({
      fileName: file.name,
      fileUri,
      localPath,
      uploadDurationMs,
    })),
    totalUploadDurationMs,
    apiCallDurationMs,
    totalDurationMs: Date.now() - startedAt,
    outputPaths,
  })
}

putOutfitsOnPerson().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
