import crossfilter from "crossfilter2";

class Crossfilter {
  constructor(data, dimensions) {
    this._xf = {};
    this._dimensions = new Map();
    this._groups = new Map();
    if (data) {
      this.init(data, dimensions);
    }
  }

  init(data, dimensions = []) {
    this._xf = crossfilter(data);

    dimensions.map(f => {
      this.addFacet(f);
      return f;
    });
  }

  _addDimension({ key, dimension, type }) {
    if (this._dimensions.has(key)) {
      throw new Error(`dimension '${key}' already exists!`);
    }
    const dim = dimension ? dimension : d => d[key];
    this._dimensions.set(key, {
      dim: this._xf.dimension(dim, type === "tags"),
      type
    });
    return this;
  }

  _addGroup({ key, reducer, group, facetKey }) {
    const k = facetKey || key;
    if (this._groups.has(k)) {
      throw new Error(`group '${k}' already exists!`);
    }
    this._groups.set(k, {
      dimension: key,
      group: this._setupGroupReducer(
        this._dimensions.get(key).dim.group(group || (data => data)),
        reducer
      )
    });
  }

  _setupGroupReducer(group, reducer = "count") {
    if (reducer instanceof Function) {
      return group.reduceSum(reducer);
    } else if (reducer instanceof Array) {
      return group.reduce(...reducer);
    } else if (reducer instanceof Object) {
      return group.reduce(reducer.add, reducer.remove, reducer.init);
    } else {
      return group.reduceCount();
    }
  }

  // a Facet is a combination of dimensions and groups
  addFacet({ key, dimension, reducer, group, facets, type }) {
    this._addDimension({ key, dimension, type });

    // If more than one aggregate per dimension
    if (facets) {
      facets.map(g => {
        return this._addGroup({
          key,
          reducer: g.reducer,
          facetKey: g.key,
          group: g.group
        });
      });
    } else {
      this._addGroup({ key, reducer, group });
    }
  }

  removeFacet(key) {
    if (this._dimensions.has(key)) {
      this._dimensions.get(key).dim.dispose();
      this._dimensions.delete(key);

      //Clean up facets associated with dimension
      for (var [facetKey, value] of this._groups.entries()) {
        if (value.dimension === key) {
          value.group.dispose();
          this._groups.delete(facetKey);
        }
      }
    }
  }

  facetExists(key) {
    return this._dimensions.has(key);
  }

  activeFacetsList() {
    return this._dimensions.keys();
  }

  applyFilter(facetKey, filters) {
    if (!this._dimensions.has(facetKey))
      throw new Error(`dimension for '${facetKey}' doesn't exist`);
    const dimension = this._dimensions.get(facetKey).dim;
    const type = this._dimensions.get(facetKey).type;

    console.log("APPLYING GILTER", facetKey, filters, type);

    if (filters.length === 0) {
      // the empty case (no filtering)
      dimension.filter(null);
    } else if (
      filters.length === 1 &&
      Array.isArray(filters[0]) &&
      type !== "composite"
    ) {
      // single range-based filter
      dimension.filterRange(filters[0]);
    } else if (filters.length === 1) {
      // single value and not a function-based filter
      dimension.filterExact(filters[0]);
    } else {
      // an array of values, or an array of filter objects
      dimension.filterFunction(function(d) {
        for (var i = 0; i < filters.length; i++) {
          var filter = filters[i];
          if (
            // (typeof filter === "string" || type === "composite") &&
            typeof filter === "string" &&
            filter === d
          ) {
            return true;
            // } else if (type === "composite" && filter[0] === d[0]) {
            //   return true;
          } else if (!isNaN(filter) && filter <= d && filter >= d) {
            return true;
          }
        }
        return false;
      });
    }
    return dimension;
  }

  async asyncReduce() {
    return this.reduce();
  }

  reduce() {
    // return new Map(
    //   [...this._groups.entries()].map(([k, v]) => [k, v.group.all()])
    // );

    // ------------------ Map -> Array of Objects ------------------
    return [...this._groups.entries()].map(([k, v]) => ({
      key: k,
      buckets: v.group.all(),
      type: this._dimensions.get(v.dimension).type
    }));

    // //------------------ Map -> Object ------------------
    // return Object.assign(
    //   {},
    //   ...[...this._groups.entries()].map(([k, v]) => ({ [k]: v.group.all() }))
    // );

    // //------------------ Object -> Object ------------------
    // return Object.keys(this._groups).reduce(function(newObj, key) {
    //   newObj[key] = this._groups[key].group.all();
    //   return newObj;
    // }, {});
  }
}

export const updateActiveFilters = (filters, key, type) => {
  console.log(type);
  //if null clear all filters
  if (key === null) {
    filters = [];
  } else if (typeof key === "object" && type !== "composite") {
    filters = key;
  } else {
    //if exclusive then ignore prev filters
    if (type === "exclusive") {
      filters = [key];
    } else {
      var index = filters.indexOf(key);
      //add if key doesn't exist in filter, or remove if it does
      if (index === -1) {
        filters.push(key);
      } else {
        filters.splice(index, 1);
      }
    }
  }
  return filters;
};

//essentially reverse of applyFilter method
export const checkActiveBucket = (bucketKey, filters) => {
  if (filters.length === 0) {
    // the empty case (no filtering)
    return false;
  } else if (filters.length === 1 && Array.isArray(filters[0])) {
    // single range-based filter
    return (
      Math.min(...filters[0]) <= +bucketKey &&
      +bucketKey < Math.max(...filters[0])
    );
  } else if (filters.length === 1) {
    // single value and not a function-based filter
    return bucketKey === filters[0];
  } else {
    // an array of values, or an array of filter objects
    for (var i = 0; i < filters.length; i++) {
      var filter = filters[i];
      if (typeof filter === "string" && filter === bucketKey) {
        return true;
      } else if (!isNaN(filter) && filter <= bucketKey && filter >= bucketKey) {
        return true;
      }
    }
    return false;
  }
};

export default Crossfilter;
