import { fal } from '@fal-ai/client'

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

const jsonPrompt = JSON.stringify({
  subject: 'The person from image 1',
  action:
    'Standing in a relaxed natural full-body pose, body facing forward, both hands in pockets, head turned slightly to the left, legs straight and parallel, one foot slightly forward, calm model stance',
  wardrobe:
    'Wearing only the white button-down shirt from image 2 as the only top layer, untucked, with pants from the image 3, and headwear from image 4, white crew socks, no shoes',
  style:
    'Ultra-realistic clean ecommerce fashion photography, minimal catalog look, polished and simple, natural proportions',
  context:
    'Plain seamless studio backdrop in a soft muted neutral color matching the outfit palette, empty set, smooth floor, centered subject, generous negative space, soft even diffused light, subtle contact shadow beneath the feet',
  camera: 'Eye-level full-body shot, 85mm lens look, sharp focus, commercial studio photograph',

  // scene: 'Professional studio photography of a photo model',
  background:
    'Matches the dominant color of the outfits put together. Background is HSL with Saturation always 55% and Lightness always 78%, only adjust the Hue.',
  // lighting: 'Three-point softbox setup creating soft, diffused highlights with no harsh shadows',
  // style: 'Ultra-realistic photo model photography with commercial quality',
  // camera: {
  //   angle: 'high angle',
  //   distance: 'medium shot',
  //   focus: 'Sharp focus on the person',
  //   'lens-mm': 85,
  //   'f-number': 'f/5.6',
  //   ISO: 200,
  // },
})

// const result = await fal.subscribe('fal-ai/nano-banana-2/edit', {
const result = await fal.subscribe('fal-ai/flux-2/flash/edit', {
  input: {
    prompt: jsonPrompt,
    guidance_scale: 2.5, // flux default
    // aspect_ratio: '2:3', // nano-banana
    // resolution: '1K', // nano-banana
    image_size: { width: 832, height: 1248 }, // flux
    num_images: 1,
    enable_safety_checker: true, // flux default
    output_format: 'png',
    image_urls: [
      'https://kurasi-samples.ryanditjia.com/people/mustache.jpg',
      'https://kurasi-samples.ryanditjia.com/collared%20shirt/collared-shirt-2.png',
      'https://kurasi-samples.ryanditjia.com/pants/pants-4.png',
      'https://kurasi-samples.ryanditjia.com/headwear/headwear-2.png',
    ],
  },
  logs: true,

  onQueueUpdate: (update) => {
    if (update.status === 'IN_PROGRESS') {
      update.logs.map((log) => log.message).forEach(console.log)
    }
  },
})
console.log(result.data)
console.log(result.requestId)
