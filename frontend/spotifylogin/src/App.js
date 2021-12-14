import React from 'react'
import ReactDOM from 'react-dom';
import Cookies from 'universal-cookie'
import './App.css';

const cookies = new Cookies()

function url(path) {
  const origin = new URL(document.location).origin
  return `${origin}${path}`
  //return `http://172.16.4.72:3000${path}`
}

function Button(props) {
  return (
    <button type="button" className={props.class} id={props.id} onClick={props.onClick}>
      {props.value}
    </button>
  )
}

class App extends React.Component {

  constructor(props) {
    super(props)
  }
  
  handleLogin = (e) => {
    console.log(e.target.id)
    document.location = url('/spotify/login')
  }

  handleJoinSession = (e) => {
    fetch(url('/spotify/sync/joinSession?session=testSession'))
    // .then(res => res.json())
    // .then(data => {
    //   cookies.set('slaveID', data.slaveID, { path: '/' })
    //   console.log(cookies.get('slaveID'))
    // })
  }

  handleDelayChange = (e) => {
    console.log(e.target.value)
    fetch(url(`/spotify/sync/setDelay?delay=${e.target.value}`))
  }

  render() {
    return (
      <div className="App">
        <Button 
          value='Log in'
          class='button'
          id='login'
          onClick={this.handleLogin}
        />
        <Button
          value='Start session'
          class='button'
          id='startSession'
          onClick={() => {document.location = url('/spotify/sync/startSession?session=testSession')}}
        />
        <Button
          value='Join session'
          class='button'
          id='joinSession'
          onClick={() => {document.location = url('/spotify/sync/joinSession?session=testSession')}}
        />

        <label>
          Delay:
          <input type='number' className='numIn' name='delayIN' onChange={this.handleDelayChange} />
        </label>

      </div>
    );
  }
}

export default App;
