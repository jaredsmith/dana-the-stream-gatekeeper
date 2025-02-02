import React, { Component, Fragment } from 'react';
import { withStyles } from '@material-ui/styles';
import { withContext } from '../contexts/AppContext';
import SipClient from '../lib/SipClient';
import Video from './Video';
import TopBar from './TopBar';

import Avatar from '@material-ui/core/Avatar';
import Button from '@material-ui/core/Button';
import VideoCamIcon from '@material-ui/icons/Videocam';
import Typography from '@material-ui/core/Typography';
import Container from '@material-ui/core/Container';
import Grid from '@material-ui/core/Grid';
import Drawer from '@material-ui/core/Drawer';
import IconButton from '@material-ui/core/IconButton';
import ScreenShareIcon from '@material-ui/icons/ScreenShare';
import StopScreenShareIcon from '@material-ui/icons/StopScreenShare';

import { ArrowBack as BackIcon } from '@material-ui/icons';

const styles = theme => ({
    '@global': {
        body: {
            ackgroundColor: theme.palette.common.white,
        },
    },
    paper: {
        marginTop: theme.spacing(8),
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
    },
    avatar: {
        margin: theme.spacing(1),
        backgroundColor: theme.palette.secondary.main,
    },
    form: {
        width: '100%', // Fix IE 11 issue.
        marginTop: theme.spacing(1),
    },
    submit: {
        margin: theme.spacing(3, 0, 2),
    },
    root: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        overflow: 'hidden'
    },
    bottomRow: {
        position: 'absolute',
        height: '200px',
        bottom: 0,
        left: 0,
        right: 0,
        overflow: 'hidden',
        paddingRight: '15px'
    }
});


class VideoRoom extends Component {
    constructor(props) {
        super(props);

        this.state = {
            localStreams: new Map(),
            streams: new Map(),
            connect: false,
            selectedStream: null,
            session: null,
            screenShareSession: null,
            screensharing: false
        };

        this._sip = new SipClient({
            name             : props.name,
            sipUri           : props.sipUri,
            sipPassword      : props.password,
            wsUri            : props.serverWssUri,
            pcConfig         : {
                iceServers: [
                    {
                        urls: [ 'stun:stun.l.google.com:19302']
                    }
                ]
            }
        });
    }

    async getScreenShareMedia() {
        let stream = await navigator.mediaDevices.getDisplayMedia({
            video: {
                cursor: 'always'
            }
        });

        this.setState((prevState) => {
            let localStreams = prevState.localStreams;

            //find the previous one and delete it
            localStreams.delete('screen-share');
            localStreams.set('screen-share', stream);
            return {
                ...prevState,
                localStreams
            }
        });

        stream.onremovetrack = () => {
            this._stopScreenShare();
        };

        return stream;
    }

    async getStream() {

        let { chosenAudioInput, chosenVideoInput } = this.props;

        //if we can support 4k then we should
        let constraints = {
            audio: true,
            video: {
                width: { min: 640, ideal: 1920 },
                height: { min: 400, ideal: 1080 },
                aspectRatio: { ideal: 1.7777777778 }
            }
        }
        if (chosenAudioInput) {
            constraints.audio = {
                deviceId: { exact: chosenAudioInput }
            }
        }

        if (chosenVideoInput) {
            constraints.video.deviceId = { exact: chosenVideoInput };
        }

        let stream = await navigator.mediaDevices.getUserMedia(constraints);
        this.setState((prevState) => {
            let localStreams = prevState.localStreams;

            //find the previous one and delete it
            localStreams.delete('local-camera');
            localStreams.set('local-camera', stream);
            return {
                ...prevState,
                localStreams
            }
        });

        return stream;
    }

    handleSession (session) {
        if (session.type === 'screen-share') {
            this.setState({ screenShareSession: session });
        }else {
            this.setState({ session });
        }
        session.on('newStream', (stream) => {
            this.setState((prevState) => {
                let streams = prevState.streams;
                streams.set(stream.id, stream);
                return {
                    ...prevState,
                    streams
                }
            });

            stream.onremovetrack = () => {
                console.log('track ended');
                if (!stream.getTracks().length) {
                    this.setState((prevState) => {
                        let streams = prevState.streams;
                        streams.delete(stream.id);
                        return {
                            ...prevState,
                            streams
                        }
                    });
                }
            };

        });

        session.on('streamRemoved', (stream) => {
            this.setState((prevState) => {
                let streams = prevState.streams;
                streams.delete(stream.id);
                return {
                    ...prevState,
                    streams
                }
            });
        });
    }

    _call() {
        const { match } = this.props;
        this.setState({connect: true});
        if (match.params.name) {
            this._sip.on('connected', () => {
                this._sip.call(match.params.name, this.state.localStreams.get('local-camera'));
            })
        }
        this._sip.start();
    }

    tearDownLocalStreams() {
        let { localStreams } = this.state;
        if (localStreams) {
            localStreams.forEach((stream) => {
                stream.getTracks().forEach((track) => {
                    track.stop();
                });
            });

            this.setState((prevState) => {
                let localStreams = prevState.localStreams;

                localStreams.clear();
                return {
                    ...prevState,
                    localStreams
                }
            });
        }
    }

    async componentDidMount () {
        await this.getStream();
        this._boundOnSession = this.handleSession.bind(this);
        this._sip.on('session', this._boundOnSession);
    }

    componentWillUnmount() {
        this._sip.removeAllListeners('session');
        if (this.state.session) {
            this.state.session.terminate();
        }
        this._sip.stop();
        this.tearDownLocalStreams();
    }

    _renderConnectModal() {
        const { classes, history } = this.props;
        const { localStreams } = this.state;

        return (
            <Fragment>
                <TopBar>
                    <IconButton edge='end' color='inherit' aria-label='Back'  onClick={() => history.push('/')}>
                        <BackIcon />
                    </IconButton>
                </TopBar>
                <Container component="main" maxWidth="xs">
                    <div className={classes.paper}>
                        <Avatar className={classes.avatar}>
                            <VideoCamIcon />
                        </Avatar>
                        <Typography component="h1" variant="h5">
                            Do you look spiffing?
                        </Typography>
                        <Video stream={localStreams.get('local-camera')} muted={true} width="100%"/>
                        <Button
                            type="submit"
                            fullWidth
                            variant="contained"
                            color="primary"
                            className={classes.submit}
                            onClick={this._call.bind(this)}
                        >
                            Yes, Yes I do
                        </Button>
                    </div>
                </Container>
            </Fragment>
        );
    }

    async _startScreenShare() {
        const { match } = this.props;

        let screenShareStream = await this.getScreenShareMedia();
        this.setState({screensharing: true});
        if (match.params.name) {
            this._sip.call(match.params.name, screenShareStream, {
                type: 'screen-share',
                rtcOfferConstraints: {
                    OfferToReceiveVideo: false,
                    OfferToReceiveAudio: false
                }
            });
        }
    }

    _stopScreenShare() {
        if (this.state.screenShareSession) {
            this.state.screenShareSession.terminate();
        }
        let screenShareStream = this.state.localStreams.get('screen-share');
        if (screenShareStream) {
            this.setState((prevState) => {
                let localStreams = prevState.localStreams;

                localStreams.delete('screen-share');
                return {
                    ...prevState,
                    localStreams
                }
            });
        }
    }

    selectedStream(stream) {
        this.setState({selectedStream: stream});
    }

    _renderStreams(streamsIterator, number, opts = {}) {
        let streamComponents = [];
        for (let i = 0; i < number; i++) {
            let stream = streamsIterator.next().value;
            streamComponents.push(<Grid item key={i}><Video stream={stream} muted={false} enableControls={true} width={opts.size} height={opts.size} inGrid={opts.inGrid}/></Grid>);
        }
        return streamComponents;
    }

    _renderStreamsContainer(streams) {
        let streamRows = []
        // streamComponents.push(<Grid item>
        //     <Video height={size} width={size} stream={myStream} muted={false} enableControls={true} onSelect={this.selectedStream.bind(this)} selected={this.state.selectedStream === myStream} />
        // </Grid>);

        // count how many streams there are and divide it by 2
        // for now we're going to always say there are 2 rows and we'll deal with making it clever later
        // ideally Asterisk would send us individual audio streams per video and so we'd do google meet
        // type auto selecting based on active speaker

        let numToRender = Math.floor(streams.size / 2);
        let streamsValue = streams.values();

        [0, 1].forEach((key) => {
            streamRows.push(<Grid
                container
                direction="row"
                justify="center"
                alignItems="center"
                spacing={2}
                key={key}
            >
                {this._renderStreams(streamsValue, numToRender, {inGrid: true})}
            </Grid>);
            numToRender = streams.size - numToRender;
        });

        // if(!this.state.selectedStream && streams.length) {
        //     this.state.selectedStream = streams.values().next().value;
        // }

        return streamRows;
    }

    render() {
        let { localStreams, streams, connect, screensharing,  } = this.state;
        let { classes, history }  = this.props;

        if (!connect) {
            return this._renderConnectModal();
        }
        let size = '150px';
        console.log('re-rendering', localStreams);

        let localStreamsValue = localStreams.values();

        return (
            <div className={classes.root}>
                <TopBar>
                    { screensharing ?
                        <IconButton edge='end' color='inherit' aria-label='Screen Share'  onClick={this._stopScreenShare.bind(this)}>
                            <StopScreenShareIcon />
                        </IconButton>
                    :
                        <IconButton edge='end' color='inherit' aria-label='Screen Share'  onClick={this._startScreenShare.bind(this)}>
                            <ScreenShareIcon />
                        </IconButton>
                    }
                    <IconButton edge='end' color='inherit' aria-label='Back'  onClick={() => history.push('/')}>
                        <BackIcon />
                    </IconButton>
                </TopBar>

                {this._renderStreamsContainer(streams)}

                <Grid
                    container
                    direction="row"
                    justify="flex-end"
                    alignItems="center"
                    spacing={2}
                    className={classes.bottomRow}
                >
                    {this._renderStreams(localStreamsValue, localStreams.size, {size, enableControls: true, muted: false})}
                </Grid>
                <Drawer anchor="right" open={false}>
                    Chat / Live transcription
                </Drawer>
            </div>
        );
    }
}

export default withStyles(styles)(withContext(VideoRoom));