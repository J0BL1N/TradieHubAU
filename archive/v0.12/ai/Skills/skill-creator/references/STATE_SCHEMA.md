# STATE_SCHEMA.md — localStorage Canonical Shapes

These are reference shapes. Actual keys/shapes must match what exists in code.
Update this doc only when the implementation changes.

## Namespacing
All keys must be prefixed with `tradiehub_`.

## Suggested Key Map
- tradiehub_users: Array<User>
- tradiehub_jobs: Array<Job>
- tradiehub_threads: Array<Thread>
- tradiehub_activeUserId: string
- tradiehub_seeded: boolean (optional)

## User
```js
{
  id: string,
  role: "customer" | "tradie" | "dual",
  name: string,
  location: string,
  trades?: string[],
  rating?: number,
  reviews?: Array<{ byId: string, stars: number, text: string, ts: number }>
}
```

## Job
```js
{
  id: string,
  title: string,
  description: string,
  categories: string[],
  customerId: string,
  status: "open" | "in_progress" | "completed",
  applicants: string[],
  acceptedTradieId?: string,
  createdAt: number,
  updatedAt: number
}
```

## Thread
```js
{
  id: string,
  participants: string[],
  jobId?: string,
  messages: Array<{ fromId: string, text: string, ts: number }>,
  lastUpdated: number
}
```
