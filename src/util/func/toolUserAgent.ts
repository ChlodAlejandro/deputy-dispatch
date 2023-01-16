import packageInfo from '../../../package.json';
import packageLockInfo from '../../../package-lock.json';

const toolUserAgent = `${
	packageInfo.name
}/${
	packageInfo.version
} node/${
	process.versions.node
} axios/${
	packageLockInfo.packages[ 'node_modules/axios' ].version
}`;

export default toolUserAgent;
