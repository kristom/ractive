import { capture } from '../global/capture';
import Model from './Model';
import { handleChange, mark, marked } from '../shared/methodCallers';

export default class ComputationChild extends Model {
	constructor ( parent, key ) {
		super( parent, key );

		this.isReadonly = !this.root.ractive.syncComputedChildren;
		this.dirty = true;
	}

	applyValue ( value ) {
		super.applyValue( value );

		if ( !this.isReadonly ) {
			let source = this.parent;
			// computed models don't have a shuffle method
			while ( source && source.shuffle ) {
				source = source.parent;
			}

			if ( source ) {
				source.dependencies.forEach( mark );
			}
		}
	}

	get ( shouldCapture ) {
		if ( shouldCapture ) capture( this );

		if ( this.dirty ) {
			this.dirty = false;
			const parentValue = this.parent.get();
			this.value = parentValue ? parentValue[ this.key ] : undefined;
		}

		return this.value;
	}

	handleChange () {
		this.dirty = true;

		if ( this.boundValue ) this.boundValue = null;

		this.links.forEach( marked );
		this.deps.forEach( handleChange );
		this.children.forEach( handleChange );
		this.clearUnresolveds(); // TODO is this necessary?
	}

	joinKey ( key ) {
		if ( key === undefined || key === '' ) return this;

		if ( !this.childByKey.hasOwnProperty( key ) ) {
			const child = new ComputationChild( this, key );
			this.children.push( child );
			this.childByKey[ key ] = child;
		}

		return this.childByKey[ key ];
	}
}
