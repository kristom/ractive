var cancelKeypathResolution, clearCache, registerDependant, unregisterDependant, notifyDependants, resolveRef;

cancelKeypathResolution = function ( root, mustache ) {
	var index = root._pendingResolution.indexOf( mustache );

	if ( index !== -1 ) {
		root._pendingResolution.splice( index, 1 );
	}
};

clearCache = function ( root, keypath ) {
	var value, dependants = root._depsMap[ keypath ], i;

	// is this a modified array, which shouldn't fire set events on this keypath anymore?
	if ( root.modifyArrays ) {
		value = root._cache[ keypath ];
		if ( isArray( value ) && !value._ractive.setting ) {
			unregisterKeypathFromArray( value, keypath, root );
		}
	}
	

	delete root._cache[ keypath ];

	if ( !dependants ) {
		return;
	}

	i = dependants.length;
	while ( i-- ) {
		clearCache( root, dependants[i] );
	}
};



registerDependant = function ( root, keypath, dependant, priority ) {
	var deps;

	if ( !root._deps[ keypath ] ) {
		root._deps[ keypath ] = [];
	}

	deps = root._deps[ keypath ];
	
	if ( !deps[ priority ] ) {
		deps[ priority ] = [ dependant ];
		return;
	}

	deps = deps[ priority ];

	if ( deps.indexOf( dependant ) === -1 ) {
		deps[ deps.length ] = dependant;
	}
};


unregisterDependant = function ( root, keypath, dependant, priority ) {
	var deps, i, keep;

	deps = root._deps[ keypath ][ priority ];
	deps.splice( deps.indexOf( dependant ), 1 );

	if ( !deps.length ) {
		root._deps[ keypath ].splice( priority, 1 );
	}

	// can we forget this keypath altogether?
	// TODO should we delete it? may be better to keep it, so we don't need to
	// create again in future
	i = root._deps[ keypath ].length;
	while ( i-- ) {
		if ( root._deps[ keypath ][i] ) {
			keep = true;
			break;
		}
	}

	if ( !keep ) {
		delete root._deps[ keypath ];
	}
};


notifyDependants = function ( root, keypath ) {
	var depsByPriority, deps, i, j, len, childDeps;

	depsByPriority = root._deps[ keypath ];

	if ( depsByPriority ) {
		len = depsByPriority.length;
		for ( i=0; i<len; i+=1 ) {
			deps = depsByPriority[i];

			if ( deps ) {
				j = deps.length;
				while ( j-- ) {
					deps[j].update();
				}
			}
		}
	}

	

	// cascade
	childDeps = root._depsMap[ keypath ];
	
	if ( childDeps ) {
		i = childDeps.length;
		while ( i-- ) {

			notifyDependants( root, childDeps[i] );
			
			// TODO at some point, no-longer extant dependants need to be removed
			// from the map. However a keypath can have no direct dependants yet
			// still have downstream dependants, so it's not entirely straightforward
		}
	}
};


// Resolve a full keypath from `ref` within the given `contextStack` (e.g.
// `'bar.baz'` within the context stack `['foo']` might resolve to `'foo.bar.baz'`
resolveRef = function ( root, ref, contextStack ) {

	var keys, lastKey, innerMostContext, contextKeys, parentValue, keypath;

	// Implicit iterators - i.e. {{.}} - are a special case
	if ( ref === '.' ) {
		return contextStack[ contextStack.length - 1 ];
	}

	keys = splitKeypath( ref );
	lastKey = keys.pop();

	// Clone the context stack, so we don't mutate the original
	contextStack = contextStack.concat();

	// Take each context from the stack, working backwards from the innermost context
	while ( contextStack.length ) {

		innerMostContext = contextStack.pop();
		contextKeys = splitKeypath( innerMostContext );

		parentValue = root.get( contextKeys.concat( keys ) );

		if ( typeof parentValue === 'object' && parentValue.hasOwnProperty( lastKey ) ) {
			keypath = innerMostContext + '.' + ref;
			break;
		}
	}

	if ( !keypath && root.get( ref ) !== undefined ) {
		keypath = ref;
	}

	return keypath;
};