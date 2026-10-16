export const ERROR_CODES = [
  // auth.md §2.5, gerais
  "validation_error", "unauthorized", "forbidden", "not_found",
  "method_not_allowed", "payload_too_large", "rate_limited", "internal_error",

  // auth.md §2.5, auth
  "invalid_credentials", "email_taken", "username_taken", "invalid_refresh",
  "oauth_failed", "oauth_cancelled", "oauth_email_conflict",

  // matches-api.md §2.6
  "match_not_found", "user_not_found", "room_full", "already_in",
  "already_in_other_match", "not_in_match", "not_host", "not_enough_players",
  "already_started", "invalid_options", "map_not_found",

  // ws-manager.md §2.8
  "invalid_message", "unauthenticated", "replaced", "slow_consumer", "server_shutdown",

  // ws-messages.md §2.7
  "not_a_member", "room_not_found",

  // i18n.md §2.7
  "avatar_too_large", "avatar_invalid", "cannot_friend_self",

  //mount-game.md §5.6 (proposta)
  "asset_load_failed",

  // gerados pela casca
  "network_error", "unknown",
] as const;

// Valores de `error.fields[campo]` (auth.md §2.5); ficam em `errors:fields.*`
export const FIELD_ERROR_CODES = [
  "required", "invalid_format", "too_short", "too_long", "weak_password", "invalid_value",
] as const;

export type FieldErrorCode = (typeof FIELD_ERROR_CODES)[number];
