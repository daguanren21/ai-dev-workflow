import { OnesTaskAdapter } from './ones/task-query'

/**
 * Stable ONES adapter entry point.
 *
 * Authentication, API transport, task operations, wiki operations, and
 * testcase reads live in focused modules under ./ones.
 */
export class OnesAdapter extends OnesTaskAdapter {}
