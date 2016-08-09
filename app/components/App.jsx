import Immutable from 'immutable';
import React, { Component, PropTypes } from 'react';
import debounce from 'lodash.debounce';

import { Events } from '../Store';
import Document from '../Document';

import Header from './Header';
import Editor from './Editor';
import Footer from './Footer';
import MessageBoxes from './MessageBox';
import ShareModal from './ShareModal';

const { object, string } = PropTypes;


export default class App extends Component {
  constructor(props, context) {
    super(props, context);

    this.state = {
      document: new Document(),
      messages: new Immutable.List(),
      loaded: false,
      displayShareModal: false,
    };

    this.updateContent = debounce(this.updateContent, 150);
    this.toggleShareModal = this.toggleShareModal.bind(this);
    this.loadAndRedirect = this.loadAndRedirect.bind(this);
    this.isReadOnly = this.isReadOnly.bind(this);
  }

  getChildContext() {
    // Pass the controller to child components.
    return {
      controller: this.props.route.controller
    };
  }

  componentDidMount() {
    this.props.route.controller.on(Events.NO_DOCUMENT_ID, (state) => {
      this.setState({
        loaded: true,
        document: state.document
      });
    });

    this.props.route.controller.on(Events.DECRYPTION_FAILED, (state) => {
      const message = {
        content: [
          'We were unable to decrypt the document. Either the secret has not',
          'been supplied or it is invalid.',
          'We have redirected you to a new document.'
        ].join(' '),
        type: 'error'
      };

      this.loadAndRedirect(state.document, '/', message);
    });

    this.props.route.controller.on(Events.DOCUMENT_NOT_FOUND, (state) => {
      const message = {
        content: [
          'We could not find the document you were trying to load, so we have',
          'redirected you to a new document.'
        ].join(' '),
        type: 'error'
      };

      this.loadAndRedirect(state.document, '/', message);
    });

    this.props.route.controller.on(Events.CONFLICT, (state) => {
      const message = {
        content: (
          <span>
            <i>Snap!</i>&nbsp;
            The document you were working on has been updated by a third,
            and you are now working on a fork. You can still find the original
            (and updated) document:&nbsp;
            <a href={`/${state.document.uuid}#${state.secret}`}>here</a>.
          </span>
        ),
        type: 'warning'
      };

      this.loadAndRedirect(
        state.fork.document,
        `/${state.fork.document.uuid}#${state.fork.secret}`,
        message
      );
    });

    this.props.route.controller.on(Events.UPDATE_WITHOUT_CONFLICT, (state) => {
      const message = {
        content: [
          'We have updated the document you are viewing to its latest revision.',
          'Happy reading/working!'
        ].join(' '),
        type: 'info'
      };

      this.setState({
        document: state.document,
        messages: this.state.messages.push(message)
      });
    });

    this.props.route.controller.on(`${Events.SYNCHRONIZE}, ${Events.CHANGE}`, (state) => {
      this.loadAndRedirect(
        state.document,
        `/${state.document.uuid}#${state.secret}`
      );
    });

    this.props.route.controller.dispatch('action:init', {
      id: this.props.params.uuid,
      secret: this.getSecret(),
    });
  }

  togglePresentationMode() {
    if (
      (!document.fullscreenElement) &&
      (!document.webkitFullscreenElement) &&
      (!document.mozFullScreenElement) &&
      (!document.msFullscreenElement)
    ) {
      const element = document.getElementsByClassName('preview')[0];

      // Switch to fullscreen
      const requestMethod = element.requestFullScreen ||
                            element.webkitRequestFullscreen ||
                            element.webkitRequestFullScreen ||
                            element.mozRequestFullScreen ||
                            element.msRequestFullscreen;

      if (requestMethod) {
        requestMethod.apply(element);
      }
    }
  }

  getSecret() {
    return window.location.hash.slice(1);
  }

  getFullAccessURL(state) {
    return `${window.location.origin}/${state.document.uuid}#${this.getSecret()}`;
  }

  getReadOnlyURL(state) {
    return `${window.location.origin}/r/${state.document.uuid}#${this.getSecret()}`;
  }

  isReadOnly() {
    return '/r' === this.props.location.pathname.substr(0, 2);
  }

  loadAndRedirect(doc, uri, message) {
    if (message) {
      this.state.messages.push(message);
    }

    this.setState({
      loaded: true,
      document: doc,
      messages: this.state.messages
    });

    if (this.isReadOnly()) {
      uri = `/r${uri}`;
    }

    if (!window.history.state || !window.history.state.uuid ||
        (window.history.state && window.history.state.uuid &&
        doc.get('uuid') !== window.history.state.uuid)
    ) {
      window.history.pushState({ uuid: doc.get('uuid') }, `Monod - ${doc.get('uuid')}`, uri);
    }
  }

  updateContent(newContent) {
    if (this.state.document.content !== newContent) {
      this.props.route.controller.dispatch('action:update-content', newContent);
    }
  }

  updateTemplate(event) {
    const newTemplate = event.target.value;

    this.props.route.controller.dispatch('action:update-template', newTemplate);
  }

  removeMessage(index) {
    this.setState({
      messages: this.state.messages.delete(index)
    });
  }

  toggleShareModal() {
    this.setState({ displayShareModal: !this.state.displayShareModal });
  }

  render() {
    return (
      <div className="layout">
        <Header
          onTogglePresentationMode={this.togglePresentationMode.bind(this)}
          onToggleShareModal={this.toggleShareModal}
          template={this.state.document.get('template')}
          onUpdateTemplate={this.updateTemplate.bind(this)}
          enableShareModalButton={'' !== window.location.pathname.slice(1)}
          readOnly={this.isReadOnly()}
        />
        <ShareModal
          isOpen={this.state.displayShareModal}
          onRequestClose={this.toggleShareModal}
          fullAccessURL={this.getFullAccessURL(this.state)}
          readOnlyURL={this.getReadOnlyURL(this.state)}
        />
        <MessageBoxes
          messages={this.state.messages}
          closeMessageBox={this.removeMessage.bind(this)}
        />
        {this.props.children && React.cloneElement(this.props.children, {
          loaded: this.state.loaded,
          content: this.state.document.get('content'),
          template: this.state.document.get('template'),
          onUpdateContent: this.updateContent.bind(this)
        })}
        <Footer version={this.props.route.version} />
      </div>
    );
  }
}

App.propTypes = {
  route: PropTypes.shape({
    version: string.isRequired,
    controller: object.isRequired,
  }),
  params: PropTypes.shape({
    uuid: string.isRequired,
  }),
  children: PropTypes.object,
};

App.childContextTypes = {
  controller: object
};
