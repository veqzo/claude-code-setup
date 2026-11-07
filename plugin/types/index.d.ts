export type SyncStatus = {
  /** False when ~/.claude is not a git checkout; the sync row stays hidden. */
  isRepo: boolean
  branch: string
  ahead: number
  behind: number
  /** Changed files the whitelist .gitignore lets through (pushed at session end). */
  dirty: number
  /** Last line of sync-hook.log when it reports a failure, else null. */
  lastFailure: string | null
  checkedAt: number
}

export type Denial = {
  label: string
  tool: string
  detail: string
  at: number
}

declare module 'claude-code' {
  interface PluginState {
    'veqzo-setup': {
      sync: SyncStatus | null
      denials: Denial[]
    }
  }
}
