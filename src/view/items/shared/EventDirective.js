import { ANCHOR, COMPONENT } from '../../../config/types';
import fireEvent from '../../../events/fireEvent';
import { splitKeypath } from '../../../shared/keypaths';
import findElement from './findElement';
import { findInViewHierarchy } from '../../../shared/registry';
import { DOMEvent, CustomEvent } from '../element/ElementEvents';
import RactiveEvent from '../component/RactiveEvent';
import runloop from '../../../global/runloop';
import { addHelpers } from '../../helpers/contextMethods';
import { resolveArgs, setupArgsFn } from '../shared/directiveArgs';
import { warnOnceIfDebug } from '../../../utils/log';
import { addToArray, removeFromArray } from '../../../utils/array';
import noop from '../../../utils/noop';

const specialPattern = /^(event|arguments)(\..+)?$/;
const dollarArgsPattern = /^\$(\d+)(\..+)?$/;

export default class EventDirective {
	constructor ( options ) {
		this.owner = options.owner || options.parentFragment.owner || findElement( options.parentFragment );
		this.element = this.owner.attributeByName ? this.owner : findElement( options.parentFragment, true );
		this.template = options.template;
		this.parentFragment = options.parentFragment;
		this.ractive = options.parentFragment.ractive;

		this.events = [];

		if ( this.element.type === COMPONENT || this.element.type === ANCHOR ) {
			this.template.n.forEach( n => {
				this.events.push( new RactiveEvent( this.element, n ) );
			});
		} else {
			this.delegate = this.element.delegate;
			this.template.n.forEach( n => this.events.push( getEvent( this, this.element, n ) ) );
		}

		// method calls
		this.resolvers = null;
		this.models = null;
	}

	bind () {
		addToArray( this.element.events, this );

		setupArgsFn( this, this.template );
		if ( !this.fn ) this.action = this.template.f;
	}

	destroyed () {
		this.events.forEach( e => e.unlisten() );
	}

	fire ( event, passedArgs = [] ) {
		// augment event object
		if ( event && !event.hasOwnProperty( '_element' ) ) {
		   addHelpers( event, this.owner );
		}

		if ( this.fn ) {
			const values = [];

			if ( event ) passedArgs.unshift( event );

			const models = resolveArgs( this, this.template, this.parentFragment, {
				specialRef ( ref ) {
					const specialMatch = specialPattern.exec( ref );
					if ( specialMatch ) {
						// on-click="foo(event.node)"
						return {
							special: specialMatch[1],
							keys: specialMatch[2] ? splitKeypath( specialMatch[2].substr(1) ) : []
						};
					}

					const dollarMatch = dollarArgsPattern.exec( ref );
					if ( dollarMatch ) {
						// on-click="foo($1)"
						return {
							special: 'arguments',
							keys: [ dollarMatch[1] - 1 ].concat( dollarMatch[2] ? splitKeypath( dollarMatch[2].substr( 1 ) ) : [] )
						};
					}
				}
			});

			if ( models ) {
				models.forEach( model => {
					if ( !model ) return values.push( undefined );

					if ( model.special ) {
						let obj = model.special === 'event' ? event : passedArgs;
						const keys = model.keys.slice();

						while ( keys.length ) obj = obj[ keys.shift() ];
						return values.push( obj );
					}

					if ( model.wrapper ) {
						return values.push( model.wrapperValue );
					}

					values.push( model.get() );
				});
			}

			// make event available as `this.event`
			const ractive = this.ractive;
			const oldEvent = ractive.event;

			ractive.event = event;
			const result = this.fn.apply( ractive, values ).pop();

			// Auto prevent and stop if return is explicitly false
			if ( result === false ) {
				const original = event ? event.original : undefined;
				if ( original ) {
					original.preventDefault && original.preventDefault();
					original.stopPropagation && original.stopPropagation();
				} else {
					warnOnceIfDebug( `handler '${this.template.n.join( ' ' )}' returned false, but there is no event available to cancel` );
				}
			}

			ractive.event = oldEvent;
		}

		else {
			let args = [];
			if ( passedArgs.length ) args = args.concat( passedArgs );
			if ( event ) event.name = this.action;

			fireEvent( this.ractive, this.action, {
				event,
				args
			});
		}
	}

	handleChange () {}

	render () {
		listen( this );
	}

	toString() { return ''; }

	unbind () {
		removeFromArray( this.element.events, this );
	}

	unrender () {
		unlisten ( this );
	}
}

EventDirective.prototype.update = noop;

function getEvent ( item, element, name, delegate ) {
	const fn = findInViewHierarchy( 'events', item.ractive, name );
	// we need to pass in "item" in order to get
	// access to node when it is created.
	return fn ? new CustomEvent( name, fn, element, delegate ) : new DOMEvent( name, element, delegate );
}

function listen ( item ) {
	if ( item.delegate ) {
		const target = item.delegate.delegated;
		const template = item.action ? item.action : item.template.f.s;
		item.template.n.forEach( n => {
			const key = `${n}:${template}`;
			if ( key in target ) {
				target[key].count++;
			} else {
				const ev = getEvent( item, item.delegate, n, true );
				ev.count = 1;
				target[key] = ev;
				runloop.scheduleTask( () => ev.listen() );
			}
		});
	} else {
		// render events after everything else, so they fire after bindings
		runloop.scheduleTask( () => item.events.forEach( e => e.listen( item ), true ) );
	}
}

function unlisten ( item ) {
	if ( item.delegate ) {
		const target = item.delegate.delegated;
		const template = item.action ? item.action : item.template.f.s;
		item.template.n.forEach( n => {
			const key = `${n}:${template}`;
			target[key].count--;
			if ( !target[key].count ) {
				target[key].unlisten();
				delete target[key];
			}
		});
	} else {
		item.events.forEach( e => e.unlisten() );
	}
}
