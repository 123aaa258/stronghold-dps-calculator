import { mount } from 'svelte';
import App from './ui/App.svelte';
import './ui/styles/global.css';

mount(App, { target: document.getElementById('app')! });
