import { cors } from 'hono/cors'
import { env } from 'hono/adapter'
import { type Context, Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
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

app.use('/api/*', cors({ origin: ['https://nickchen.top', 'http://localhost:5050', 'https://www.nickchen.top'] }))

app.get('/', (c) => {
  return c.text('Hello World from Hono')
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
  .post(async (c) => {
    const id = Number.parseInt(c.req.param('id') as string)
    const { title } = c.req.query()
    const db = getDB(c)
    const blog = await db.select().from(schema.blog).where(eq(schema.blog.id, id))
    if (blog.length === 0) {
      try {
        return c.json({
          success: true,
          value: await db.insert(schema.blog).values({ id, postLink: c.req.path, title }).returning(),
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
    const ips = [...(blog[0].likes?.split(',') as string[])]
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
  const db = getDB(c)
  try {
    if (isVisitor) {
      await db.insert(schema.comment).values({ isVisitor: true, visitorIp: ip, value, commentPool: id, parent: Number.parseInt(to) })
      return c.json({
        success: true,
        message: 'Commented',
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

export default app
