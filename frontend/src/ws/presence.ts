// Quem dos meus amigos está online, depois de uma mudança. Sem mudança, devolve o mesmo Set: o
// React compara a referência e não redesenha quem lê
export function withPresence(online: ReadonlySet<number>, userId: number,
  isOnline: boolean): ReadonlySet<number> {
  if (online.has(userId) === isOnline)
    return online;
  const next = new Set(online);
  if (isOnline)
    next.add(userId);
  else
    next.delete(userId);
  return next;
}
