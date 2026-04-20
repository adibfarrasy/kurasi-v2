const apiKey = '1d073c4bc98fffb5b96d08a2d9355b2d'

type KieTaskState = 'waiting' | 'queuing' | 'generating' | 'success' | 'fail'

type KieCreateTaskResponse = {
  code: number
  message: string
  data?: {
    taskId: string
  }
}

type KieRecordInfoResponse = {
  code: number
  message: string
  data?: {
    taskId: string
    model: string
    state: KieTaskState
    param: string
    resultJson: string
    failCode: string
    failMsg: string
    costTime: number
    completeTime: number
    createTime: number
  }
}

const POLL_INTERVAL_MS = 500
const terminalStates: readonly KieTaskState[] = ['success', 'fail']

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function parseJsonString<T>(value: string) {
  if (!value) {
    return null
  }

  try {
    return JSON.parse(value) as T
  } catch {
    return value
  }
}

async function runKie() {
  const createResponse = await fetch('https://api.kie.ai/api/v1/jobs/createTask', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'nano-banana-2',
      input: {
        prompt: `Create try-on picture of a person.
- Person from image 1
- Before try-on, make sure you replace the white tshirt the person is wearing
- Wear shirt from image 2
- Wear pants from image 3
- Wear beanie from image 4.
- Always keep the shirt untucked
- The person is posing in a relaxed manner, body faces forward, face faces very slightly left, hands on pockets, not smiling too much.
- Background is dominant color of the outfits put together.
- Background should be HSL with Saturation always 55% and Lightness always 78%.
- Just adjust the hue to make it the dominant color of the outfits put together.`,
        image_input: [
          'https://kurasi-samples.ryanditjia.com/people/mustache.jpg',
          'https://kurasi-samples.ryanditjia.com/collared%20shirt/collared-shirt-1.png',
          'https://kurasi-samples.ryanditjia.com/pants/pants-9.png',
          'https://kurasi-samples.ryanditjia.com/headwear/headwear-1.png',
        ],
        aspect_ratio: '2:3',
        google_search: false,
        resolution: '1K',
        output_format: 'png',
      },
    }),
  })

  const createResult = (await createResponse.json()) as KieCreateTaskResponse

  if (!createResponse.ok || createResult.code !== 200 || !createResult.data?.taskId) {
    throw new Error(`Failed to create Kie task: ${createResult.message}`)
  }

  const taskId = createResult.data.taskId
  const wallClockStartedAt = Date.now()

  console.log(`Created Kie task ${taskId}`)

  while (true) {
    const recordInfoUrl = new URL('https://api.kie.ai/api/v1/jobs/recordInfo')
    recordInfoUrl.searchParams.set('taskId', taskId)

    const recordInfoResponse = await fetch(recordInfoUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    })

    const recordInfoResult = (await recordInfoResponse.json()) as KieRecordInfoResponse

    if (!recordInfoResponse.ok || recordInfoResult.code !== 200 || !recordInfoResult.data) {
      throw new Error(`Failed to query Kie task ${taskId}: ${recordInfoResult.message}`)
    }

    const { data } = recordInfoResult
    const wallClockDurationMs = Date.now() - wallClockStartedAt

    console.log(
      `[${new Date().toISOString()}] state=${data.state} wallClockDurationMs=${wallClockDurationMs}`,
    )

    if (!terminalStates.includes(data.state)) {
      await sleep(POLL_INTERVAL_MS)
      continue
    }

    const serverDurationMs =
      data.completeTime > 0 && data.createTime > 0 ? data.completeTime - data.createTime : null

    const summary = {
      taskId: data.taskId,
      model: data.model,
      state: data.state,
      wallClockDurationMs,
      serverDurationMs,
      reportedCostTimeMs: data.costTime,
      createdAt: data.createTime ? new Date(data.createTime).toISOString() : null,
      completedAt: data.completeTime ? new Date(data.completeTime).toISOString() : null,
      failCode: data.failCode || null,
      failMsg: data.failMsg || null,
      param: parseJsonString(data.param),
      result: parseJsonString<{ resultUrls?: string[] }>(data.resultJson),
    }

    console.log(summary)

    if (data.state === 'fail') {
      throw new Error(data.failMsg || `Kie task ${taskId} failed`)
    }

    return summary
  }
}

runKie().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
