import process from 'node:process'
import { cors } from 'hono/cors'
import { env } from 'hono/adapter'
import { type Context, Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { githubAuth } from '@hono/oauth-providers/github'
import * as schema from './db/schema'

/**
 * Get the database connection object.
 * This function retrieves the database connection object from the context and uses it to initialize the Drizzle ORM.
 * @param {Context} c - The context object containing the database connection configuration.
 * @returns {Drizzle} - The Drizzle ORM instance initialized with the database connection.
 */
function getDB(c: Context) {
  const { DB } = env<{ DB: D1Database }>(c)
  return drizzle(DB, { schema })
}

function encodeIP(ip: string) {
  const parts = ip.split('.')
  return ((Number.parseInt((parts.join(''))) << 1)).toString(36)
}

const app = new Hono()

app.use('/api/*', cors({ origin: ['https://nickchen.top', 'localhost:5173', 'https://www.nickchen.top'] }))

app.use(
  '/github',
  githubAuth({
    client_id: process.env.GITHUB_ID,
    client_secret: process.env.GITHUB_SECRET,
    scope: ['public_repo', 'read:user', 'user', 'user:email', 'user:follow'],
    oauthApp: true,
  }),
)

app.get('/', (c) => {
  return c.text('Hello World from Hono')
})

app.all('/api/ping', (c) => {
  return c.text('pong')
})

app.get('/api/blog/context', async (c) => {
  const db = getDB(c)
  const path = c.req.query('path')
  const blog = await db.select().from(schema.blog).where(eq(schema.blog.postLink, path as string))
  if (blog.length === 0) {
    return c.json({
      exist: false,
      message: 'blog not found',
    })
  }
  return c.json({
    exist: true,
    blog: blog[0],
  })
})

app.get('/api/blog/:id{[0-9]+}/context', async (c) => {
  // TODO: add `limit` and `offset` query to compress the response size
  const id = Number.parseInt(c.req.param('id') as string)
  const db = getDB(c)
  const comments = await db.query.blog.findMany({
    with: {
      comments: true,
    },
    where: (post, { eq }) => eq(post.id, id),
  })
  if (comments.length === 0) {
    return c.json({
      success: false,
      message: 'blog not found',
    })
  }
  return c.json(comments[0])
})
  .delete(async (c) => {
    const id = Number.parseInt(c.req.param('id') as string)
    const db = getDB(c)
    const blog = await db.select().from(schema.blog).where(eq(schema.blog.id, id))
    if (blog.length === 0) {
      return c.json({
        success: false,
        message: 'blog not found',
      })
    }
    try {
      await db.delete(schema.blog).where(eq(schema.blog.id, id))
      return c.json({
        success: true,
        message: 'Deleted',
      })
    }
    catch (e) {
      if (e instanceof Error) {
        return c.json({
          success: false,
          message: e.message,
        })
      }
    }
  })

app.post('/api/blog/bind_new', async (c) => {
  const { title, post_link } = c.req.query()
  const db = getDB(c)
  const blog = await db.select().from(schema.blog).where(eq(schema.blog.postLink, post_link))
  if (blog.length === 0) {
    try {
      return c.json({
        success: true,
        value: await db.insert(schema.blog).values({ postLink: post_link, title }).returning(),
      })
    }
    catch (e) {
      if (e instanceof Error) {
        return c.json({
          success: false,
          message: e.message,
        })
      }
    }
  }
  return c.json({
    success: false,
    message: 'blog already exists',
  })
})

app.post('/api/blog/:id{[0-9]+}/like', async (c) => {
  const id = Number.parseInt(c.req.param('id'))
  const ip = encodeIP(c.req.header('CF-Connecting-IP') as string)
  const db = getDB(c)
  const blog = await db.select().from(schema.blog).where(eq(schema.blog.id, id))
  if (blog.length === 0) {
    return c.json({
      success: false,
      message: 'blog not found',
    })
  }
  try {
    const ips = (blog[0].likes?.split(',') as string[]).filter(ip => ip !== '')
    if (ips.includes(ip)) {
      return c.json({
        success: false,
        message: 'Already liked',
      })
    }
    else {
      const new_likes = ips.push(ip)
      await db.update(schema.blog).set({ likes: ips.join(',') }).where(eq(schema.blog.id, id))
      return c.json({
        success: true,
        message: 'Liked',
        new_likes,
      })
    }
  }
  catch (e) {
    if (e instanceof Error) {
      return c.json({
        success: false,
        message: e.message,
      })
    }
  }
})

app.post('/api/blog/:id{[0-9]+}/comments', async (c) => {
  const id = Number.parseInt(c.req.param('id'))
  const ip = encodeIP(c.req.header('CF-Connecting-IP') as string)
  const { to, value, isVisitor } = c.req.query()
  // query() fucking my type
  const db = getDB(c)
  try {
    const blog = await db.select().from(schema.blog).where(eq(schema.blog.id, id))
    if (blog.length === 0) {
      return c.json({
        success: false,
        message: 'blog not found',
      })
    }
    if (Number.parseInt(isVisitor) === 1 || isVisitor === 'true') {
      const comment_id = await db.insert(schema.comment).values({ isVisitor: true, visitorIp: ip, value, commentPool: id, parent: Number.parseInt(to) })
        .returning({ id: schema.comment.id })
      return c.json({
        success: true,
        message: 'Commented',
        value: comment_id[0].id,
      })
    }
    else {
      return c.text('Not implemented')
    }
  }
  catch (e) {
    if (e instanceof Error) {
      return c.json({
        success: false,
        message: e.message,
      })
    }
  }
})
  .delete(async (c) => {
    try {
      const id = Number.parseInt(c.req.query('id') as string)
      const db = getDB(c)
      const comment = await db.select().from(schema.comment).where(eq(schema.comment.id, id))
      if (comment.length === 0) {
        return c.json({
          success: false,
          message: 'comment not found',
        })
      }
      if (comment[0].visitorIp === encodeIP(c.req.header('CF-Connecting-IP') as string)) {
        await db.delete(schema.comment).where(eq(schema.comment.id, id))
        return c.json({
          success: true,
          message: 'Deleted',
        })
      }
      else {
        return c.json({
          success: false,
          message: 'Not allowed to delete a comment from another user',
        })
      }
    }
    catch (e) {
      if (e instanceof Error) {
        return c.json({
          success: false,
          message: e.message,
        })
      }
    }
  })

app.post('/api/blog/:id{[0-9]+}/onBuild/genAISummary', async (c) => {
  const body = await c.req.json()
  const content = body.content
  if (content === '')
    return c.text('No content')
  const { AI } = env<{ AI: Ai }>(c)
  const id = c.req.param('id')
  const db = getDB(c)
  const blog = await db.select().from(schema.blog).where(eq(schema.blog.id, Number.parseInt(id)))
  if (blog.length === 0) {
    return c.json({
      success: false,
      message: 'blog not found',
    })
  }
  if (blog[0].aiSummary !== null) {
    return c.json({
      success: false,
      message: 'there already exists a summary',
    })
  }

  try {
    const repl = (await AI.run('@cf/qwen/qwen1.5-14b-chat-awq', {
      prompt: `
      请概括一下这篇文章的内容：

      ${content}
      `,
      max_tokens: 2048,
      temperature: 0.7,
    })) as { response: string }
    const summary = repl.response
    await db.update(schema.blog).set({ aiSummary: summary }).where(eq(schema.blog.id, Number.parseInt(id)))
    return c.json({
      success: true,
      message: 'Summary generated',
      value: summary,
    })
  }
  catch (e) {
    if (e instanceof Error) {
      return c.json({
        success: false,
        message: e.message,
      })
    }
  }
})
  .delete(async (c) => {
    const { id } = c.req.param()
    const db = getDB(c)
    try {
      const blog = await db.select().from(schema.blog).where(eq(schema.blog.id, Number.parseInt(id)))
      if (blog.length === 0) {
        return c.json({
          success: false,
          message: 'blog not found',
        })
      }
      await db.update(schema.blog).set({ aiSummary: null }).where(eq(schema.blog.id, Number.parseInt(id)))
      return c.json({
        success: true,
        message: 'Deleted',
      })
    }
    catch (e) {
      if (e instanceof Error) {
        return c.json({
          success: false,
          message: e.message,
        })
      }
    }
  })

export default app
