if (!(process.env.GAE_SERVICE || process.env.GOOGLE_CLOUD_PROJECT))
  require('dotenv').config({ silent: true })
const axios = require('axios')
const app = require('express')()
const datastore = require('@google-cloud/datastore')()
app.enable('trust proxy')
axios.defaults.headers.common['X-Key'] = process.env.FORTNITE_STATS_KEY

const players = [
  "akhanubis",
  "changofanko",
  "elreme",
  "JoacoM24",
  "Jorninos94",
  "Juanso871",
  "ramanujans",
  "manquito"
];

const sizes = [20, 6, 6, 6, 6, 6, 6, 9, 9, 9]
const headers = ['Player', 'K-D', 'K-D 1d', 'K-D 7d', 'K/D', 'K/D 1d', 'K/D 7d', 'Wins', 'Wins 1d', 'Wins 7d']

padded_cell = (text, column_i) => (text + ' '.repeat(sizes[column_i])).slice(0, sizes[column_i]) + '|'

table_header = () => {
  let headers_row = headers.reduce((out, h, i) => out + padded_cell(h, i), '|'),
      delimiter_row = sizes.reduce((out, size, i) => out + padded_cell('-'.repeat(size), i), '|')
  return `${ headers_row }\n${ delimiter_row }`
}

format_date = d => {
  dd = d.getDate(),
  mm = d.getMonth() + 1,
  yyyy = d.getFullYear()
  if(dd < 10)
    dd = '0' + dd
  if(mm < 10)
    mm = '0' + mm
  return yyyy + mm + dd
}

today = () => format_date(new Date())

days_ago = ago => {
  let d = new Date()
  d.setDate(d.getDate() - ago)
  return format_date(d)
}

delta_to_table = (d_0, d_1, d_7) => {
  let table = table_header()
  for (let i = 0; i < d_0.length; i++)
    table += player_data_to_row(d_0[i], d_1[i], d_7[i])
  return '```' + table + '```'
}

player_data_to_row = (d0, d1, d7) => {
  let delta_k_1d = d0.all.kills - d1.all.kills,
      delta_k_7d = d0.all.kills - d7.all.kills,
      delta_d_1d = d0.all.deaths - d1.all.deaths,
      delta_d_7d = d0.all.deaths - d7.all.deaths,
      delta_w_1d = d0.all.wins - d1.all.wins,
      delta_w_7d = d0.all.wins - d7.all.wins,
      delta_m_1d = d0.all.matchesPlayed - d1.all.matchesPlayed,
      delta_m_7d = d0.all.matchesPlayed - d7.all.matchesPlayed,
      kd = d0.all.kills - d0.all.deaths,
      kd1d = delta_k_1d - delta_d_1d,
      kd7d = delta_k_7d - delta_d_7d,
      kperd = d0.all.deaths ? (d0.all.kills / d0.all.deaths).toFixed(2) : '',
      kperd1d = delta_d_1d ? (delta_k_1d / delta_d_1d).toFixed(2) : '',
      kperd7d = delta_d_7d ? (delta_k_7d / delta_d_7d).toFixed(2) : '',
      w = d0.all.matchesPlayed ? `${ d0.all.wins } (${ (d0.all.wins * 100 / d0.all.matchesPlayed).toFixed(0) }%)` : '',
      w1d = delta_m_1d ? `${ delta_w_1d } (${ (delta_w_1d * 100 / delta_m_1d).toFixed(0) }%)` : '',
      w7d = delta_m_7d ? `${ delta_w_7d } (${ (delta_w_7d * 100 / delta_m_7d).toFixed(0) }%)` : ''
  return [d0.player, kd, kd1d, kd7d, kperd, kperd1d, kperd7d, w, w1d, w7d].reduce((row, value, index) => row + padded_cell(value, index), "\n|")
}

sleep_between_requests = () => new Promise(resolve => setTimeout(resolve, 2000))

fetch_player_data = p => new Promise(resolve => axios.get(`https://fortnite.y3n.co/v2/player/${ p }`).then(r => resolve({ ...r.data.br.stats.pc, player: p })))

store_players_data = data => datastore.upsert({
    key: datastore.key(['Stats', today()]),
    data: { date: today(), stats: data }
  }).then(() => console.log('Data stored'))

retrieve_data = ago => {
  let q = datastore.createQuery('Stats').filter('date', '=', days_ago(ago))
  return datastore.runQuery(q)
}

async function fetch_current_data() {
  let ps = [...players], data = []
  while (ps.length) {
    p = ps.shift()
    console.log(`Fetching ${ p }...`)
    let p_data = await fetch_player_data(p)
    data = data.concat(p_data)
    await sleep_between_requests()
  }
  return data
}

async function show_stats(_, res) {
  res.status(200).end()
  let current_data = await fetch_current_data()
  let old_results = await Promise.all([retrieve_data(1), retrieve_data(7)])
  data_1d = old_results[0][0][0].stats
  data_7d = old_results[1][0][0].stats
  axios.post(process.env.WEBHOOK, {
    content: delta_to_table(current_data, data_1d, data_7d)
  }).then(() => console.log('Stats posted'))
}

async function cron_job(_, res) {
  res.status(200).end()
  store_players_data(await fetch_current_data())
}

app.get('/store_stats', cron_job)
app.get('/show_stats', show_stats)

const PORT = process.env.PORT || 8080
app.listen(process.env.PORT || 8080, () => {
  console.log(`App listening on port ${PORT}`)
  console.log('Press Ctrl+C to quit.')
})