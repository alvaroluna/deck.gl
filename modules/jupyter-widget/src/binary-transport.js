import jsonConverter from './create-deck';

// Functions to wrangle data from pydeck's row major order matrix dataframe to the deck.gl binary data format.
// The format used is described here:
// https://deck.gl/#/documentation/developer-guide/performance-optimization?section=supply-attributes-directly

// eslint-disable-next-line complexity
function dtypeToTypedArray(dtype) {
  // Supports converting a numpy-typed array to a JavaScript-typed array
  // based on a string value dtype and a DataView `data`
  switch (dtype) {
    case 'int8':
      return Int8Array;
    case 'uint8':
      return Uint8Array;
    case 'int16':
      return Int16Array;
    case 'uint16':
      return Uint16Array;
    case 'float32':
      return Float32Array;
    case 'float64':
      return Float64Array;
    case 'int32':
      return Int32Array;
    case 'uint32':
      return Uint32Array;
    case 'int64':
      return BigInt64Array; // eslint-disable-line no-undef
    case 'uint64':
      return BigUint64Array; // eslint-disable-line no-undef
    default:
      throw new Error(`Unrecognized dtype ${dtype}`);
  }
}

function deserializeMatrix(arr, manager) {
  /*
   * Data is sent from the pydeck backend
   * in the following format:
   *`
   * {'<layer ID>':
   *     {'<accessor function name e.g. getPosition>': {
   *        {
   *          layer_id: <duplicate ID of layer as above>
   *          column_name: <string name of column>
   *          matrix: {
   *            data: <binary data, a row major order representation of a matrix>,
   *            shape: [<height>, <width>],
   *            dtype: <string representation of typed array data type>
   *          }
   *
   * Multiple layers and multiple accessors are possible.
   *
   * Objects at the JSON path `<accessor name>.matrix.data`
   * are vectors representing a 1 x n matrix,
   * or they can represent a m x n matrix in row major order form;
   * shape of the matrix is given at <accessor name>.matrix.data.shape
   */
  if (!arr) {
    return null;
  }
  const dataBuffer = {};
  for (const datum of arr.payload) {
    // Each entry here represents a single column in
    // a pandas.DataFrame arriving from the pydeck backend
    const layerId = datum.layer_id;
    const accessorName = datum.accessor;
    if (!dataBuffer[layerId]) {
      dataBuffer[layerId] = {};
    }
    // Creates a typed array of the numpy data as a row-major ordered matrix, with shape specified elsewhere
    const ArrayType = dtypeToTypedArray(datum.matrix.dtype);
    dataBuffer[layerId][accessorName] = {
      layerId,
      accessorName,
      columnName: datum.column_name,
      matrix: {data: new ArrayType(datum.matrix.data), shape: datum.matrix.shape}
    };
    if (dataBuffer[layerId][accessorName].matrix.data.length === 0) {
      console.warn(`No records in accessor ${accessor} belonging to ${layerId}`); // eslint-disable-line
    }
  }
  // Becomes the data stored within the widget model at `model.get('data_buffer')`
  return dataBuffer;
}

function constructDataProp(dataBuffer, layerId) {
  const src = {length: 0, attributes: {}};
  // For each accessor, we have a row major ordered matrix of data,
  // represented as a single vector under `[accessor]matrix.data`
  for (const accessor in dataBuffer[layerId]) {
    const currentData = dataBuffer[layerId][accessor];
    src.length = Math.max(currentData.matrix.shape[0], src.length);
    src.attributes[accessor] = {
      size: currentData.matrix.shape[1] || 1, // width
      value: currentData.matrix.data
    };
  }
  return src;
}

function processDataBuffer({dataBuffer, jsonProps}) {
  // Takes JSON props and combines them with the binary data buffer
  jsonConverter.convert(jsonProps);
  const convertedJsonProps = jsonConverter.convertedJson;
  for (let i = 0; i < convertedJsonProps.layers.length; i++) {
    const layer = convertedJsonProps.layers[i];
    // Replace data on every layer prop
    const data = constructDataProp(dataBuffer, layer.id);
    const clonedLayer = layer.clone({data});
    convertedJsonProps.layers[i] = clonedLayer;
  }
  return convertedJsonProps;
}

export {deserializeMatrix, processDataBuffer};