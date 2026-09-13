const githubPagesHost = window.location.hostname.match(/^([^.]+)\.github\.io$/)
const repositoryName = window.location.pathname.split('/').filter(Boolean)[0]
  || (githubPagesHost ? `${githubPagesHost[1]}.github.io` : '')

if (githubPagesHost && repositoryName) {
  const repositoryUrl = `https://github.com/${githubPagesHost[1]}/${repositoryName}`
  document.querySelectorAll('.github-link').forEach((link) => {
    link.href = repositoryUrl
  })
  document.querySelectorAll('.release-link').forEach((link) => {
    link.href = `${repositoryUrl}/releases/latest`
  })
} else {
  document.querySelectorAll('.github-link, .release-link').forEach((link) => {
    link.addEventListener('click', (event) => event.preventDefault())
    link.title = 'GitHub Pagesで公開するとリンクが有効になります'
  })
}
