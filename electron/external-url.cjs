function parseExternalHttpsUrl(rawUrl, allowedHosts) {
  const url = new URL(rawUrl)
  if (url.protocol !== 'https:') throw new Error('HTTPSではないリンクは開けません。')
  if (allowedHosts && !allowedHosts.includes(url.hostname)) throw new Error('許可されていないリンクです。')
  return url
}

function getAuthorizedReserveUrl(state, isbn, systemId) {
  const rawUrl = state?.collectionCache?.[isbn]?.[systemId]?.reserveurl
  if (typeof rawUrl !== 'string' || !rawUrl) throw new Error('保存された予約ページが見つかりません。蔵書を再確認してください。')
  return parseExternalHttpsUrl(rawUrl)
}

module.exports = { getAuthorizedReserveUrl, parseExternalHttpsUrl }
