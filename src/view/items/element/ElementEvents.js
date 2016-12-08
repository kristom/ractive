import { fatal } from '../../../utils/log';

class DOMEvent {
	constructor ( name, owner, delegate ) {
		if ( name.indexOf( '*' ) !== -1 ) {
			fatal( `Only component proxy-events may contain "*" wildcards, <${owner.name} on-${name}="..."/> is not valid` );
		}

		this.name = name;
		this.owner = owner;
		this.node = null;
		this.handler = null;
		this.delegate = delegate;
	}

	listen ( directive ) {
		const node = this.node = this.owner.node;
		const name = this.name;

		// this is probably a custom event fired from a decorator or manually
		if ( !( `on${name}` in node ) ) return;

		node.addEventListener( name, this.handler = ( event ) => {
			if ( directive ) {
				directive.fire({
					node,
					original: event
				});
			} else {
				fireMatchingDirectives( this, event.target, node.parentNode, event );
			}
		}, false );
	}

	unlisten () {
		if ( this.handler ) this.node.removeEventListener( this.name, this.handler, false );
	}
}

class CustomEvent {
	constructor ( name, eventPlugin, owner, delegate ) {
		this.eventPlugin = eventPlugin;
		this.owner = owner;
		this.handler = null;
		this.delegate = delegate;
	}

	listen ( directive ) {
		const node = this.owner.node;

		this.handler = this.eventPlugin( node, ( event = {} ) => {
			event.node = event.node || node;
			if ( directive ) {
				directive.fire( event );
			} else {
				fireMatchingDirectives( this, event.original ? event.original.target : event.node || node, node.parentNode, event );
			}
		});
	}

	unlisten () {
		this.handler.teardown();
	}
}

function fireMatchingDirectives ( holder, _node, root, event ) {
	let node = _node;

	while ( node && node !== root ) {
		const item = node._ractive ? node._ractive.proxy : false;
		if ( item ) {
			item.events.forEach( e => {
				if ( ~e.template.n.indexOf( holder.name ) ) {
					e.fire( event );
				}
			});
		}

		node = node.parentNode;
	}
}

export { DOMEvent, CustomEvent };
