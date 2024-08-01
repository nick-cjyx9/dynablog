import { expect, it } from 'vitest'

interface responseBody {
  success: boolean
  message?: string
  value?: any
}

const url_base = 'https://dynablog.nickchen.top/api'
const e = (endpoint: string) => (`${url_base}${endpoint}`)

it('ping', async () => {
  const res = await fetch(e('/ping'))
  expect(await res.text()).toBe('pong')
})

it('create blog', async () => {
  const res = await fetch(e('/blog/860213/context'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: '测试',
      post_link: '/example',
    }),
  })
  expect(((await res.json()) as responseBody).success).toBe(true)
})

it('get blog', async () => {
  const res = await fetch(e('/blog/860213/context'))
  expect(res.status).toBe(200)
})

it('like', async () => {
  const res = await fetch(e('/blog/860213/like'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  })
  expect(((await res.json()) as responseBody).success).toBe(true)
})

let comment_id: number

it('comment', async () => {
  const res = await fetch(e('/blog/860213/comments?isVisitor=1&value=春日影'), {
    method: 'POST',
  })
  const resj = (await res.json()) as responseBody
  comment_id = resj.value
  expect(resj.success).toBe(true)
})

it('delete comment', async () => {
  // eslint-disable-next-line no-console
  console.log(comment_id)
  const res = await fetch(e(`/blog/860213/comments?id=${comment_id}`), {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
  })
  expect(((await res.json()) as responseBody).success).toBe(true)
})

it('delete blog', async () => {
  const res = await fetch(e('/blog/860213/context'), {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
  })
  expect(((await res.json()) as responseBody).success).toBe(true)
})
