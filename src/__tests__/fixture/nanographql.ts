const getOpname = /(query|mutation) ?([\w\d-_]+)? ?\(.*?\)? \{/;

export function nanographql(str: string) {
  const query = Array.isArray(str) ? str.join("") : str;
  const name = getOpname.exec(query);
  return function (variables?: any) {
    const data = {
      query,
      variables: JSON.stringify(variables),
      operationName: undefined as string | undefined,
    };
    if (name && name.length) {
      const operationName = name[2];
      if (operationName) data.operationName = name[2];
    }
    return JSON.stringify(data);
  };
}
